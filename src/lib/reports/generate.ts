// מנוע יצירת דוח שבועי — בונה הקשר (פרופיל לקוח + נתוני שבוע) ומריץ Claude.
// משמש גם את ה-route הידני וגם את ה-cron.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { buildSystemPrompt } from "@/lib/api/ai/buildSystemPrompt";
import { getWeeklyClientData, type WeeklyClientData, type PlatformTotals } from "./weekly-data";
import { groupCampaignsByProduct } from "./group-by-product";

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
): string {
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
        lines.push(`    · ${c.campaignName} [${c.platform}]: ${money(c.spend, currency)}, ${num(c.conversions)} המרות`);
      }
    }
  } else {
    lines.push(``);
    lines.push(`**קמפיינים מובילים (לפי הוצאה):**`);
    for (const c of data.perCampaign.slice(0, 15)) {
      const cpa = c.conversions > 0 ? money(c.spend / c.conversions, currency) : "—";
      lines.push(`- ${c.campaignName} [${c.platform}]: ${money(c.spend, currency)}, ${num(c.conversions)} המרות, עלות/המרה ${cpa}`);
    }
  }

  return lines.join("\n");
}

const REPORT_INSTRUCTIONS = `אתה כותב דוח שבועי ללקוח של סוכנות DigiTailors על תוצאות הקמפיינים שלו.
כתוב ב-Markdown בעברית, בטון מקצועי וברור ללקוח (לא ז'רגון פנימי).
מבנה הדוח:
1. **כותרת + תקופת הדיווח**
2. **סיכום מנהלים** — 2-3 משפטים על מה קרה השבוע.
3. **ביצועים** — לפי פלטפורמה (או לפי מוצר אם התבקש), עם המספרים החשובים.
4. **תובנות** — מה עבד טוב ומה פחות, על סמך המספרים בלבד.
5. **המלצות לשבוע הבא** — 3 פעולות קונקרטיות ומעשיות שנגזרות מהנתונים.

חוקים מחייבים:
- התבסס אך ורק על המספרים שסופקו, אל תמציא נתונים. אם אין נתונים לפלטפורמה — אל תזכיר אותה.
- **מטבע:** השתמש אך ורק במטבע ובסימן שסופקו בנתונים ("מטבע החשבון"). לעולם אל תניח שקלים אם המטבע שונה.
- **אל תשתמש בטבלאות Markdown** (הן נשברות בהעתקה לוואטסאפ). הצג מספרים כרשימות תבליטים בפורמט "מדד: ערך", עם אימוג'ים קצרים לכותרות סקשנים. שמור על שורות קצרות.`;

/** מריץ Claude ומחזיר את תוכן הדוח (Markdown) */
export async function generateWeeklyReportContent(
  clientId: string,
  weekStart: string,
  weekEnd: string,
): Promise<string> {
  const [systemBase, profile, data, client] = await Promise.all([
    buildSystemPrompt(clientId),
    prisma.clientProfile.findUnique({ where: { clientId } }),
    getWeeklyClientData(clientId, weekStart, weekEnd),
    prisma.client.findUnique({ where: { id: clientId }, select: { currency: true } }),
  ]);

  const format = profile?.weeklyReportFormat ?? "standard";
  const instructions = profile?.weeklyReportInstructions ?? "";
  const products: Array<{ name: string }> = profile ? JSON.parse(profile.products ?? "[]") : [];
  const currency = client?.currency || "ILS";

  const dataText = buildWeeklyDataText(data, format, products, currency);

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
    system: `${systemBase}\n\n---\n\n${REPORT_INSTRUCTIONS}`,
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
