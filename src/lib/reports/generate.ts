// מנוע יצירת דוח שבועי — בונה הקשר (פרופיל לקוח + נתוני שבוע) ומריץ Claude.
// משמש גם את ה-route הידני וגם את ה-cron.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { buildSystemPrompt } from "@/lib/api/ai/buildSystemPrompt";
import { getWeeklyClientData, type WeeklyClientData, type PlatformTotals } from "./weekly-data";
import { groupCampaignsByProduct } from "./group-by-product";
import { classifyBusinessType, buildBusinessKnowledge, type LeadFunnel, type CrmAccess } from "@/lib/agent/business-knowledge";
import { detectClientFunnel, type CampaignFunnel } from "@/lib/agent/funnel-detect";
import { shiftYmd } from "@/lib/utils/ildate";

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
  const t = data.totals;
  const lines: string[] = [];
  lines.push(`תקופת הדיווח: ${data.weekStart} עד ${data.weekEnd}`);
  lines.push(`מטבע החשבון: ${currency}`);
  lines.push(``);
  lines.push(`**סיכום כולל:**`);
  lines.push(`- הוצאה כוללת: ${money(t.spend, currency)}`);
  lines.push(`- המרות: ${num(t.conversions)}`);
  lines.push(`- עלות להמרה: ${t.conversions > 0 ? money(t.spend / t.conversions, currency) : "—"}`);
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
        lines.push(`    · ${c.campaignName} [${c.platform}]${funnelTag(c)}: ${money(c.spend, currency)}, ${num(c.conversions)} המרות`);
      }
    }
  } else {
    lines.push(``);
    lines.push(`**קמפיינים מובילים (לפי הוצאה):**`);
    for (const c of data.perCampaign.slice(0, 15)) {
      const cpa = c.conversions > 0 ? money(c.spend / c.conversions, currency) : "—";
      lines.push(`- ${c.campaignName} [${c.platform}]${funnelTag(c)}: ${money(c.spend, currency)}, ${num(c.conversions)} המרות, עלות/המרה ${cpa}`);
    }
  }

  return lines.join("\n");
}

const REPORT_INSTRUCTIONS = `אתה כותב דוח שבועי ללקוח של סוכנות DigiTailors על תוצאות הקמפיינים שלו.
כתוב ב-Markdown בעברית, בטון מקצועי וברור ללקוח (לא ז'רגון פנימי).
מבנה הדוח:
1. **כותרת + תקופת הדיווח**
2. **סיכום מנהלים** — 2-3 משפטים על מה קרה השבוע, שפותחים במגמה מול השבוע הקודם (השתפרנו/נסוגנו וכמה).
3. **ביצועים** — לפי פלטפורמה (או לפי מוצר אם התבקש), עם המספרים החשובים.
4. **תובנות** — מה עבד טוב ומה פחות, על סמך המספרים בלבד.
5. **המלצות לשבוע הבא** — 3 פעולות קונקרטיות ומעשיות שנגזרות מהנתונים.

חוקים מחייבים:
- התבסס אך ורק על המספרים שסופקו, אל תמציא נתונים. אם אין נתונים לפלטפורמה — אל תזכיר אותה.
- אם סופק בלוק "השוואה לשבוע הקודם" — שקף את הכיוון (↑/↓ ואחוז) של המדדים המרכזיים בטקסט, במיוחד בסיכום המנהלים. שים לב: בעלות-לליד ובעלות-להמרה ירידה היא שיפור, בהמרות/ROAS עלייה היא שיפור.
- אם קמפיינים מתויגים "(טופס לידים)" או "(דף נחיתה)" — בסיכום הכולל אחד את כל הלידים למספר אחד, אבל בפילוח לפי מוצר/שירות הפרד בין לידים מטופס לבין לידים מדף נחיתה/אתר.
- **מטבע:** השתמש אך ורק במטבע ובסימן שסופקו בנתונים ("מטבע החשבון"). לעולם אל תניח שקלים אם המטבע שונה.
- **אל תשתמש בטבלאות Markdown** (הן נשברות בהעתקה לוואטסאפ). הצג מספרים כרשימות תבליטים בפורמט "מדד: ערך", עם אימוג'ים קצרים לכותרות סקשנים. שמור על שורות קצרות.`;

/** מריץ Claude ומחזיר את תוכן הדוח (Markdown) */
export async function generateWeeklyReportContent(
  clientId: string,
  weekStart: string,
  weekEnd: string,
): Promise<string> {
  const [systemBase, profile, data, prevData, client, funnelDetection] = await Promise.all([
    buildSystemPrompt(clientId),
    prisma.clientProfile.findUnique({ where: { clientId } }),
    getWeeklyClientData(clientId, weekStart, weekEnd),
    getWeeklyClientData(clientId, shiftYmd(weekStart, -7), shiftYmd(weekEnd, -7)),
    prisma.client.findUnique({ where: { id: clientId }, select: { currency: true, clientType: true } }),
    detectClientFunnel(clientId, { until: weekEnd }),
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

  const dataText = buildWeeklyDataText(data, format, products, currency, prevData, campaignFunnels);

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
