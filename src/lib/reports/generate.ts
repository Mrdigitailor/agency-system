// מנוע יצירת דוח שבועי — בונה הקשר (פרופיל לקוח + נתוני שבוע) ומריץ Claude.
// משמש גם את ה-route הידני וגם את ה-cron.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { buildSystemPrompt } from "@/lib/api/ai/buildSystemPrompt";
import { getWeeklyClientData, getWeeklyBreakdowns, type WeeklyClientData, type PlatformTotals, type WeeklyBreakdowns } from "./weekly-data";
import { groupCampaignsByProduct } from "./group-by-product";
import { classifyBusinessType, buildBusinessKnowledge, type LeadFunnel, type CrmAccess } from "@/lib/agent/business-knowledge";
import { detectClientFunnel, type CampaignFunnel } from "@/lib/agent/funnel-detect";
import { syncClientMeta, syncClientMetaSubLevels } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { shiftYmd, todayIL } from "@/lib/utils/ildate";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.REPORT_AI_MODEL ?? "claude-sonnet-4-6";

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", ILS: "₪", EUR: "€", GBP: "£" };

/** עיצוב סכום לפי מטבע החשבון (USD→$, ILS→₪, אחר→קוד מטבע) */
function money(n: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const amount = Math.round(n).toLocaleString("en-US");
  return sym ? `${sym}${amount}` : `${amount} ${currency}`;
}
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const dec = (n: number) => n.toFixed(2);

/** שורת השוואה בין ערך נוכחי לקודם עם כיוון ואחוז שינוי */
function deltaLine(label: string, cur: number, prev: number, fmt: (n: number) => string): string | null {
  if (cur === 0 && prev === 0) return null; // אין נתונים בשתי התקופות — לא מציגים
  if (prev === 0) return `  - ${label}: ${fmt(cur)} (חדש — לא היו נתונים בשבוע הקודם)`;
  const pct = ((cur - prev) / prev) * 100;
  const arrow = pct > 0.5 ? "↑" : pct < -0.5 ? "↓" : "→";
  const sign = pct > 0 ? "+" : "";
  return `  - ${label}: ${fmt(cur)} לעומת ${fmt(prev)} (${arrow} ${sign}${pct.toFixed(0)}%)`;
}

function platformLine(label: string, t: PlatformTotals, currency: string): string | null {
  if (t.spend === 0 && t.conversions === 0) return null;
  const cpa = t.conversions > 0 ? money(t.spend / t.conversions, currency) : "—";
  return `  - ${label}: הוצאה ${money(t.spend, currency)}, ${num(t.conversions)} המרות, עלות/המרה ${cpa}, ${num(t.clicks)} קליקים, ${num(t.impressions)} חשיפות`;
}

/** בונה בלוק טקסט קריא עם כל הנתונים, לפי הפורמט והמטבע המבוקשים */
export function buildWeeklyDataText(
  data: WeeklyClientData,
  format: string,
  products: Array<{ name: string }>,
  currency: string,
  prev?: WeeklyClientData,
  campaignFunnels?: Record<string, CampaignFunnel>,
  breakdowns?: WeeklyBreakdowns,
): string {
  // תיוג משפך לקמפיין — כדי שהדוח יפריד לידים מטופס מול לידים מדף נחיתה (בפילוח לפי מוצר)
  const funnelTag = (c: { platform: string; campaignName: string }): string => {
    if (!campaignFunnels) return "";
    if (c.platform === "google") return " (דף נחיתה)"; // גוגל = תמיד אתר/דף נחיתה
    const f = campaignFunnels[c.campaignName];
    if (f === "native_form") return " (טופס לידים)";
    if (f === "landing_page") return " (דף נחיתה)";
    return "";
  };
  // תיוג מטרת הקמפיין — כדי שהדוח יציג את התוצאה הנכונה (רכישות/שיחות/עוקבים מול לידים)
  const goalTag = (c: { resultType?: string }): string =>
    c.resultType === "purchases" ? " {מטרה: רכישות}"
    : c.resultType === "messages" ? " {מטרה: שיחות}"
    : c.resultType === "engagement" ? " {מטרה: מעורבות/עוקבים}"
    : "";
  const t = data.totals;
  const lines: string[] = [];
  lines.push(`תקופת הדיווח: ${data.weekStart} עד ${data.weekEnd}`);
  lines.push(`מטבע החשבון: ${currency}`);
  lines.push(``);
  lines.push(`**סיכום כולל:**`);
  lines.push(`- הוצאה כוללת: ${money(t.spend, currency)}`);
  // אם ההמרות מפוצלות לכמה קטגוריות (לידים + שיחות וכו') וכולן ממטא — מציגים בנפרד
  const cats = data.conversionCategories ?? [];
  const pureMetaConv = data.perPlatform.google.conversions + data.perPlatform.tiktok.conversions === 0;
  if (cats.length > 1 && pureMetaConv) {
    lines.push(`- המרות (פילוח): ${cats.map((c) => `${num(c.count)} ${c.label}`).join(" · ")} — סה"כ ${num(t.conversions)}`);
    const leadsCat = cats.find((c) => c.label === "לידים");
    if (leadsCat && leadsCat.count > 0) lines.push(`- עלות לליד (הוצאה ÷ לידים בלבד): ${money(t.spend / leadsCat.count, currency)}`);
  } else {
    lines.push(`- המרות: ${num(t.conversions)}`);
    lines.push(`- עלות להמרה: ${t.conversions > 0 ? money(t.spend / t.conversions, currency) : "—"}`);
  }
  // רכישות (מטא) — נפרד מלידים. מוצג רק אם יש, כדי שספירת רכישות תהיה מדויקת ולא תנוחש
  if (data.metaPurchases > 0) {
    lines.push(`- רכישות (מטא, נפרד מלידים): ${num(data.metaPurchases)}${data.metaPurchaseValue > 0 ? ` · ערך ${money(data.metaPurchaseValue, currency)}` : ""}`);
  }
  lines.push(`- ערך המרות: ${money(t.conversionsValue, currency)}`);
  lines.push(`- ROAS: ${t.roas > 0 ? dec(t.roas) : "—"}`);
  lines.push(`- קליקים: ${num(t.clicks)} | חשיפות: ${num(t.impressions)} | CTR: ${t.impressions > 0 ? dec((t.clicks / t.impressions) * 100) + "%" : "—"}`);

  // השוואה לשבוע הקודם (אותו אורך טווח, שבוע אחורה) — כיוון ואחוז שינוי לכל מדד מרכזי
  if (prev) {
    const p = prev.totals;
    const cmp = [
      deltaLine("הוצאה", t.spend, p.spend, (n) => money(n, currency)),
      deltaLine("המרות", t.conversions, p.conversions, num),
      deltaLine("עלות להמרה", t.cpa, p.cpa, (n) => money(n, currency)),
      t.conversionsValue > 0 || p.conversionsValue > 0
        ? deltaLine("ערך המרות", t.conversionsValue, p.conversionsValue, (n) => money(n, currency))
        : null,
      t.roas > 0 || p.roas > 0 ? deltaLine("ROAS", t.roas, p.roas, dec) : null,
      deltaLine("קליקים", t.clicks, p.clicks, num),
    ].filter(Boolean);
    if (cmp.length > 0) {
      lines.push(``);
      lines.push(`**השוואה לשבוע הקודם (${prev.weekStart} עד ${prev.weekEnd}):**`);
      lines.push(...(cmp as string[]));
    }
  }

  lines.push(``);
  lines.push(`**לפי פלטפורמה:**`);
  for (const [label, totals] of [["Meta", data.perPlatform.meta], ["Google Ads", data.perPlatform.google], ["TikTok", data.perPlatform.tiktok]] as const) {
    const l = platformLine(label, totals, currency);
    if (l) lines.push(l);
  }

  if (format === "per_product" && products.length > 0) {
    lines.push(``);
    lines.push(`**לפי מוצר (קיבוץ קמפיינים לפי שם):**`);
    const groups = groupCampaignsByProduct(data.perCampaign, products);
    for (const g of groups) {
      if (g.campaigns.length === 0) {
        lines.push(`- ${g.product}: אין קמפיינים פעילים בתקופה`);
        continue;
      }
      const cpa = g.totals.conversions > 0 ? money(g.totals.spend / g.totals.conversions, currency) : "—";
      lines.push(`- **${g.product}**: הוצאה ${money(g.totals.spend, currency)}, ${num(g.totals.conversions)} המרות, עלות/המרה ${cpa}`);
      for (const c of g.campaigns) {
        lines.push(`    · ${c.campaignName} [${c.platform}]${funnelTag(c)}${goalTag(c)}: ${money(c.spend, currency)}, ${num(c.conversions)} לידים${c.purchases > 0 ? `, ${num(c.purchases)} רכישות` : ""}`);
      }
    }
  } else {
    lines.push(``);
    lines.push(`**קמפיינים מובילים (לפי הוצאה):**`);
    for (const c of data.perCampaign.slice(0, 15)) {
      const cpa = c.conversions > 0 ? money(c.spend / c.conversions, currency) : "—";
      lines.push(`- ${c.campaignName} [${c.platform}]${funnelTag(c)}${goalTag(c)}: ${money(c.spend, currency)}, ${num(c.conversions)} לידים, עלות/ליד ${cpa}${c.purchases > 0 ? `, ${num(c.purchases)} רכישות` : ""}`);
    }
  }

  // מילת התוצאה לפי סוג הקמפיין (רבים + יחיד) — רכישות/לידים/שיחות/מעורבות
  const resultWord = (rt?: string) =>
    rt === "purchases" ? { pl: "רכישות", sg: "רכישה" }
    : rt === "messages" ? { pl: "שיחות", sg: "שיחה" }
    : rt === "engagement" ? { pl: "תוצאות", sg: "תוצאה" }
    : { pl: "לידים", sg: "ליד" };

  // פירוק קהלים (קבוצות מודעות) ומודעות — מטא. מופיע רק אם נשאבו נתוני תת-רמות.
  if (breakdowns && breakdowns.audiences.length > 0) {
    lines.push(``);
    lines.push(`**קהלים מובילים (קבוצות מודעות, מטא — לפי הוצאה):**`);
    for (const b of breakdowns.audiences) {
      const w = resultWord(b.resultType);
      const cpa = b.conversions > 0 ? money(b.spend / b.conversions, currency) : "—";
      lines.push(`- ${b.name}${b.parentName ? ` [קמפיין: ${b.parentName}]` : ""}: ${money(b.spend, currency)}, ${num(b.conversions)} ${w.pl}, עלות/${w.sg} ${cpa}`);
    }
  }
  if (breakdowns && breakdowns.ads.length > 0) {
    lines.push(``);
    lines.push(`**מודעות מובילות (מטא — לפי הוצאה):**`);
    for (const b of breakdowns.ads) {
      const w = resultWord(b.resultType);
      const cpa = b.conversions > 0 ? money(b.spend / b.conversions, currency) : "—";
      lines.push(`- ${b.name}${b.parentName ? ` [קבוצה: ${b.parentName}]` : ""}: ${money(b.spend, currency)}, ${num(b.conversions)} ${w.pl}, עלות/${w.sg} ${cpa}`);
    }
  }

  return lines.join("\n");
}

const REPORT_INSTRUCTIONS = `אתה כותב דוח שבועי ללקוח של סוכנות Mr.digitailor על תוצאות הקמפיינים שלו.
כתוב ב-Markdown בעברית, בטון מקצועי וברור ללקוח (לא ז'רגון פנימי).

**קריטי — הדוח נשלח ישירות ללקוח, כפי שהוא, בלי עריכה נוספת:**
- הלקוח קורא את הדוח הזה. אתה, הסוכנות, אחראים על התוצאות — אז **לעולם אל תבקר את העבודה של עצמנו**. אסור להשתמש במילים כמו "גרוע", "כישלון", "בזבוז", "ביצועים גרועים", "עבודה לא טובה", "מאכזב", "בעייתי". גם קמפיין חלש מתואר בשפה עניינית ומכבדת.
- כשמדד ירד או קמפיין לא הביא תוצאות — **אל תשפוט**, אלא נסח בונה וצופה-פני-עתיד: מה זיהינו, ומה אנחנו מתכננים לעשות בשבוע הקרוב כדי לשפר. לדוגמה במקום "קמפיין X נכשל" → "קמפיין X עדיין לא הגיע לביצועים הרצויים — בשבוע הקרוב נבחן קריאייטיב חדש ונדייק את הקהל".
- **סעיף ההמלצות נכתב כתוכנית פעולה שלנו** ("בשבוע הקרוב נעשה X, נבדוק Y") — הלקוח רואה מה אנחנו כבר מתכננים ומבצעים עבורו, זה משדר שליטה ויוזמה. לא "מומלץ ש..." בגוף סתמי, אלא "אנחנו נ...".
- הטון: שותף מקצועי, שקוף, בשליטה. גם כשהשבוע היה פחות חזק — הלקוח צריך לצאת מהדוח בתחושה שאנחנו על זה ויודעים בדיוק מה הצעד הבא.

מבנה הדוח:
1. **כותרת + תקופת הדיווח**
2. **סיכום מנהלים** — 2-3 משפטים על מה קרה השבוע, שפותחים במגמה מול השבוע הקודם (השתפרנו/נסוגנו וכמה).
3. **ביצועים** — לפי פלטפורמה (או לפי מוצר אם התבקש), עם המספרים החשובים.
4. **תובנות** — מה עבד טוב ומה פחות, על סמך המספרים בלבד.
5. **המלצות לשבוע הבא** — 3 פעולות קונקרטיות ומעשיות שנגזרות מהנתונים.

חוקים מחייבים:
- התבסס אך ורק על המספרים שסופקו, אל תמציא נתונים. אם אין נתונים לפלטפורמה — אל תזכיר אותה.
- **לעולם אל תכתוב שחסרים נתונים, ש"יש לספק נתונים", או בקשות פנימיות כלשהן.** זה דוח שנשלח ללקוח. אם נתון/סקשן מסוים (למשל פילוח קהלים/מודעות) אינו קיים בנתונים — פשוט השמט אותו בשקט, בלי להזכיר שהוא חסר.
- **רכישות מול לידים:** אם סופקה שורת "רכישות" — היא נתון נפרד ומדויק. לעולם אל תנחש או תגזור מספר רכישות — השתמש אך ורק במספר שסופק. אל תערבב רכישות עם לידים.
- **מטרת קמפיין:** נתח כל קמפיין לפי המטרה שלו, אל תכפה ספירת לידים על קמפיין שאינו לידים:
  · "{מטרה: רכישות}" = קמפיין מכירות → הצג רכישות כתוצאה העיקרית (עלות לרכישה = הוצאה חלקי רכישות).
  · "{מטרה: שיחות}" = התוצאה היא שיחות/פניות בהודעות.
  · "{מטרה: מעורבות/עוקבים}" = קמפיין מודעות/עוקבים (לא לידים!) → התוצאה היא חשיפות, מעורבות והגדלת קהל. אל תציג אותו כ-"0 לידים" ואל תסמן אותו כ🔴 כישלון — זו מטרה אחרת לגמרי.
  · בלי תיוג = קמפיין לידים.
- אם סופק בלוק "השוואה לשבוע הקודם" — שקף את הכיוון (↑/↓ ואחוז) של המדדים המרכזיים בטקסט, במיוחד בסיכום המנהלים. שים לב: בעלות-לליד ובעלות-להמרה ירידה היא שיפור, בהמרות/ROAS עלייה היא שיפור.
- אם קמפיינים מתויגים "(טופס לידים)" או "(דף נחיתה)" — בסיכום הכולל אחד את כל הלידים למספר אחד, אבל בפילוח לפי מוצר/שירות הפרד בין לידים מטופס לבין לידים מדף נחיתה/אתר.
- אם סופק "המרות (פילוח)" עם כמה קטגוריות (למשל לידים + שיחות בהודעות) — **חובה להציג אותן בנפרד** לכל אורך הדוח. לעולם אל תאחד אותן למספר אחד ואל תקרא לכולן "לידים". השתמש בעלות-לליד שסופקה (הוצאה ÷ לידים בלבד), לא בעלות שמחלקת את ההוצאה גם בשיחות.
- אם סופקו בלוקים "קהלים מובילים" / "מודעות מובילות" — הוסף סקשן קצר 🎯 עם 2-3 תובנות בלבד: הקהל החזק ביותר, קהל שמבזבז תקציב בלי תוצאות, והמודעה המנצחת. שמות קבוצות מודעות מייצגים קהלים ושמות מודעות מייצגים קריאייטיבים — נקה גם אותם משמות גולמיים (כמו קמפיינים). אל תפרט את כל הרשימה — רק את מה שדורש החלטה.
- **מטבע:** השתמש אך ורק במטבע ובסימן שסופקו בנתונים ("מטבע החשבון"). לעולם אל תניח שקלים אם המטבע שונה.
- **אל תשתמש בטבלאות Markdown** (הן נשברות בהעתקה לוואטסאפ). הצג מספרים כרשימות תבליטים בפורמט "מדד: ערך", עם אימוג'ים קצרים לכותרות סקשנים. שמור על שורות קצרות.

כללי קריאוּת (קריטיים — הדוח נקרא בוואטסאפ על מסך טלפון):
- **לעולם אל תציג שם קמפיין גולמי.** שמות כמו "Nova || Lead Gen || B2B || Soprano SE" הם שמות פנימיים של הסוכנות. חלץ מכל קמפיין את שם המוצר/ההצעה בלבד והצג רק אותו: "Nova || Lead Gen || B2B || Soprano SE" → "סופרנו SE"; "Lead Gen | Lecture - Dr Elvira Gur Lautman | 21.06.2026" → "הרצאה — ד"ר אלווירה". השמט קידומות (שם הלקוח, Lead Gen, B2B), תאריכים, מפרידי || וסימוני NEW. שם מוצר לועזי מוכר אפשר להשאיר באנגלית — כל השאר בעברית.
- **שורה אחת לכל קמפיין, בתבנית קבועה:** שם — תוצאה · עלות · מגמה. דוגמה: "סופרנו SE — 3 לידים · ₪197 לליד 🔴 התייקר (היה ₪83)". מגמה חיובית 🟢, שלילית 🔴, קמפיין חדש 🆕.
- **אל תכתוב את ההשוואה כמשפט** ("ירידה של 9 לידים ועלייה של 33.3% בעלות לליד לעומת שבוע קודם") — רק המילה הקצרה + הערך הקודם בסוגריים בודדים: "השתפר (היה ₪233)". בלי סוגריים בתוך סוגריים.
- **קמפיינים בלי תוצאות — שורה מאוחדת אחת:** "3 קמפיינים לא הניבו לידים השבוע: אופוס, פרופילו, פריים-איקס". אל תפרט כל אחד בנפרד.
- **עיגול:** סכומים למספר שלם (₪140, לא ₪139.93); אחוזים ללא נקודה עשרונית מעל 10% (34%, לא 33.7%).`;

/** מריץ Claude ומחזיר את תוכן הדוח (Markdown) */
export async function generateWeeklyReportContent(
  clientId: string,
  weekStart: string,
  weekEnd: string,
): Promise<string> {
  const [systemBase, profile, data, prevData, client, funnelDetection, breakdowns] = await Promise.all([
    buildSystemPrompt(clientId),
    prisma.clientProfile.findUnique({ where: { clientId } }),
    getWeeklyClientData(clientId, weekStart, weekEnd),
    getWeeklyClientData(clientId, shiftYmd(weekStart, -7), shiftYmd(weekEnd, -7)),
    prisma.client.findUnique({ where: { id: clientId }, select: { currency: true, clientType: true } }),
    detectClientFunnel(clientId, { until: weekEnd }),
    getWeeklyBreakdowns(clientId, weekStart, weekEnd),
  ]);

  const format = profile?.weeklyReportFormat ?? "standard";
  const instructions = profile?.weeklyReportInstructions ?? "";
  const products: Array<{ name: string }> = profile ? JSON.parse(profile.products ?? "[]") : [];
  const currency = client?.currency || "ILS";

  // ידע עסקי — מסווג את סוג העסק וקובע אילו מדדים להדגיש (כוכב הצפון).
  // סוג המשפך מזוהה אוטומטית מסריקת הקמפיינים; הפרופיל הוא fallback כשאין מספיק דאטה.
  const businessType = classifyBusinessType(client?.clientType);
  const leadFunnel: LeadFunnel =
    funnelDetection.funnel !== "unknown" ? funnelDetection.funnel : ((profile?.leadFunnel as LeadFunnel) || "landing_page");
  const businessKnowledge = buildBusinessKnowledge({
    type: businessType,
    leadFunnel,
    crm: (profile?.crmAccess as CrmAccess) || "none",
  });
  // תיוג קמפיינים (טופס/דף נחיתה) — רלוונטי רק ללקוחות לידים
  const campaignFunnels = businessType === "leads" ? funnelDetection.metaCampaigns : undefined;

  const dataText = buildWeeklyDataText(data, format, products, currency, prevData, campaignFunnels, breakdowns);

  const userMessage = [
    `הפק דוח שבועי לתקופה ${weekStart} עד ${weekEnd}.`,
    `\nמטבע החשבון: ${currency} — הצג את כל הסכומים במטבע הזה בלבד.`,
    instructions ? `\nהוראות ספציפיות של הלקוח (חשוב לכבד): ${instructions}` : "",
    format === "per_product" ? `\nהלקוח מעדיף פילוח לפי מוצר.` : "",
    `\n\nהנתונים בפועל:\n${dataText}`,
  ].join("");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: `${systemBase}\n\n---\n\n${businessKnowledge}\n\n---\n\n${REPORT_INSTRUCTIONS}`,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text.trim() : "";
}

/**
 * סנכרון מהיר של השבוע לפני הפקת הדוח — רק אם השבוע קרוב (14 יום אחרונים),
 * כדי לא לסנכרן מחדש דוחות היסטוריים. קמפיינים בלבד, guarded (כשל לא חוסם הפקה).
 */
async function ensureWeekSynced(clientId: string, weekStart: string, weekEnd: string) {
  const daysSinceEnd = Math.round((new Date(todayIL()).getTime() - new Date(weekEnd).getTime()) / 86400000);
  if (daysSinceEnd > 14) return; // דוח היסטורי — הדאטה כבר קיימת
  const daysBack = Math.min(10, Math.max(9, daysSinceEnd + 8)); // מכסה את השבוע שהסתיים; השבוע הקודם להשוואה כבר מסונכרן
  // גבול-זמן לשאיבת רמות עמוקות — נתון "נחמד שיש" (פילוח קהלים/מודעות), לא קריטי.
  // בחשבון גדול זה עלול לקחת דקות; אם חורג — הדוח מופק עם מה שנשאב עד כה.
  const withTimeout = <T>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
  await Promise.all([
    // קמפיינים: אינקרמנטלי (מהיר) — מושך ימים חסרים + 3 אחרונים
    syncClientMeta(clientId, daysBack, false, { campaignsOnly: true }).catch(() => null),
    syncClientGoogleAds(clientId, daysBack, { skipSearchTerms: true }).catch(() => null),
    // רמות קהל/מודעה: בנפרד לשבוע הדוח — כי סנכרון הקמפיינים מדלג עליהן כשאין ימים חסרים
    withTimeout(syncClientMetaSubLevels(clientId, weekStart, weekEnd).catch(() => null), 120_000),
  ]);
}

/**
 * מייצר ושומר טיוטת דוח שבועי. אידמפוטנטי: אם קיימת טיוטה עם תוכן ואין force — מחזיר אותה.
 */
export async function generateAndSaveWeeklyReport(
  clientId: string,
  weekStart: string,
  weekEnd: string,
  force = false,
) {
  const existing = await prisma.weeklyReport.findUnique({
    where: { clientId_weekStart: { clientId, weekStart } },
  });
  if (existing && existing.content && !force) return existing;

  // ודא שהשבוע סונכרן במלואו לפני ההפקה — מונע דוח על נתונים חלקיים
  // (הסנכרון היומי לא תמיד מספיק למשוך את הימים האחרונים לפני הפקת הדוח).
  // מסלול מהיר: קמפיינים בלבד, בלי רמות קהל/מודעה/עמוד ובלי מונחי חיפוש.
  await ensureWeekSynced(clientId, weekStart, weekEnd);

  const content = await generateWeeklyReportContent(clientId, weekStart, weekEnd);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { campaignManagerId: true, campaignManager: true },
  });

  return prisma.weeklyReport.upsert({
    where: { clientId_weekStart: { clientId, weekStart } },
    update: { content, weekEnd, status: "draft" },
    create: {
      clientId,
      weekStart,
      weekEnd,
      content,
      status: "draft",
      campaignManagerId: client?.campaignManagerId ?? "",
      campaignManagerName: client?.campaignManager ?? "",
    },
  });
}
