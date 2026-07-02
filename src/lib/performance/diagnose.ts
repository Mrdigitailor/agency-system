// אבחון AI לירידת ביצועים — מפיק סיכום + פעולות מדורגות. שליחה לאישור: approval.ts
import Anthropic from "@anthropic-ai/sdk";
import { getWeeklyClientData } from "@/lib/reports/weekly-data";
import { getCurrencySymbol } from "@/lib/utils/currency";
import { recentRange, baselineRange, datesLabel, type ClientDetection } from "./detect";

const MODEL = process.env.DIAGNOSIS_AI_MODEL ?? "claude-sonnet-4-6";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Action {
  title: string;
  detail: string;
  priority: "low" | "medium" | "high" | "urgent";
  platform?: string;
  campaign?: string;
}
export interface Diagnosis {
  summary: string;
  severity: "low" | "medium" | "high";
  actions: Action[];
}

async function buildContext(det: ClientDetection): Promise<string> {
  const sym = getCurrencySymbol(det.currency);
  const rr = recentRange();
  const br = baselineRange();
  const [recentWk, baseWk] = await Promise.all([
    getWeeklyClientData(det.clientId, rr.since, rr.until).catch(() => null),
    getWeeklyClientData(det.clientId, br.since, br.until).catch(() => null),
  ]);

  const key = (c: { platform: string; campaignName: string }) => `${c.platform}|${c.campaignName}`;
  const ctrOf = (imp: number, clk: number) => (imp > 0 ? (clk / imp) * 100 : 0);
  const baseMap = new Map((baseWk?.perCampaign ?? []).map((c) => [key(c), c]));
  const campLines = (recentWk?.perCampaign ?? []).slice(0, 8).map((c) => {
    const b = baseMap.get(key(c));
    const cpa = c.conversions > 0 ? c.spend / c.conversions : 0;
    const bcpa = b && b.conversions > 0 ? b.spend / b.conversions : 0;
    const ctr = ctrOf(c.impressions, c.clicks);
    const bctr = b ? ctrOf(b.impressions, b.clicks) : 0;
    return `- [${c.platform}] ${c.campaignName}: 7 ימים אחרונים — הוצאה ${sym}${Math.round(c.spend)}, ${Math.round(c.conversions)} המרות, CPA ${cpa ? sym + Math.round(cpa) : "—"}, CTR ${ctr.toFixed(2)}%, ${Math.round(c.impressions).toLocaleString()} חשיפות | שבוע קודם: CPA ${bcpa ? sym + Math.round(bcpa) : "—"}, ${b ? Math.round(b.conversions) : 0} המרות, CTR ${bctr.toFixed(2)}%`;
  }).join("\n");

  const r = det.recent, b = det.baseline;
  return [
    `לקוח: ${det.clientName} | סוג: ${det.clientType} | מטבע: ${det.currency} | תקציב חודשי: ${sym}${Math.round(det.monthlyBudget)}${det.targetCpa > 0 ? ` | יעד CPA: ${sym}${Math.round(det.targetCpa)}` : ""}`,
    `תאריכי ההשוואה: ${datesLabel()}`,
    ``,
    `סיגנלים שזוהו אוטומטית:`,
    ...det.signals.map((s) => `- ${s.label}: ${s.detail}`),
    ``,
    `מדדים מצטברים (כל הפלטפורמות):`,
    `- 7 ימים אחרונים: הוצאה ${sym}${Math.round(r.spend)}, ${Math.round(r.conversions)} המרות, CPA ${r.cpa ? sym + Math.round(r.cpa) : "—"}, CTR ${r.ctr.toFixed(2)}%${det.clientType === "ecom" ? `, ROAS ${r.roas.toFixed(1)}` : ""}`,
    `- 7 ימים שלפני כן: הוצאה ${sym}${Math.round(b.spend)}, ${Math.round(b.conversions)} המרות, CPA ${b.cpa ? sym + Math.round(b.cpa) : "—"}, CTR ${b.ctr.toFixed(2)}%${det.clientType === "ecom" ? `, ROAS ${b.roas.toFixed(1)}` : ""}`,
    `- החודש עד היום: הוצאה ${sym}${Math.round(det.mtdSpend)}, CPA ${det.mtdCpa ? sym + Math.round(det.mtdCpa) : "—"}${det.targetCpa > 0 ? ` (יעד ${sym}${Math.round(det.targetCpa)})` : ""}`,
    ``,
    `קמפיינים (7 ימים אחרונים מול שבוע קודם):`,
    campLines || "- (אין פירוט קמפיינים)",
  ].join("\n");
}

const TOOL: Anthropic.Tool = {
  name: "report_diagnosis",
  description: "מדווח אבחון של ירידת ביצועים + רשימת פעולות מדורגת לתיקון",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "משפט-שניים בעברית: מה קרה ומה הסיבה הסבירה, בשפה של בעל עסק" },
      severity: { type: "string", enum: ["low", "medium", "high"], description: "חומרת המצב" },
      actions: {
        type: "array",
        description: "עד 4 פעולות קונקרטיות וברות-ביצוע, מהחשובה לפחות",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "כותרת פעולה קצרה וברורה (לדוגמה: 'עצור אדסט X')" },
            detail: { type: "string", description: "הסבר קצר + הנתון שתומך בפעולה" },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            platform: { type: "string", description: "meta | google_ads | tiktok (אם רלוונטי)" },
            campaign: { type: "string", description: "שם הקמפיין הרלוונטי (אם יש)" },
          },
          required: ["title", "detail", "priority"],
        },
      },
    },
    required: ["summary", "severity", "actions"],
  },
};

const SYSTEM = `אתה מנהל קמפיינים בכיר ומנוסה בסוכנות פרסום דיגיטלי. קיבלת נתוני ביצועים מלאים של לקוח שירד (הוצאה, המרות, CPA, CTR, חשיפות — פר-פלטפורמה ופר-קמפיין, שבוע אחרון מול הקודם).

**החוק החשוב ביותר: אתה המנתח. אסור לך לכתוב לבעל הסוכנות "בדוק / בחן / בדוק אם / תשומת לב ל..." על שום מדד.** יש לך את כל הנתונים — אתה זה שבודק ומסיק. במקום "בדוק אם ה-CTR ירד" — קבע: "ה-CTR ירד מ-2.1% ל-1.3% (שחיקת קריאייטיב)". כל פעולה חייבת להיות **מסקנה סופית + צעד ביצוע קונקרטי** (עצור אדסט X, חתוך תקציב ב-30% בקמפיין Y, החלף קריאייטיב, העלה תקציב ל-Z) — לא משימת חקירה.

הנחיות נוספות:
- התבסס רק על הנתונים שקיבלת. אם חסר לך מדד מסוים כדי להסיק — הסק ממה שיש (CTR, CPA, המרות, הוצאה) ואל תבקש לבדוק אותו.
- היה ספציפי: שמות קמפיינים ומספרים אמיתיים מהנתונים.
- **ציין תמיד את התאריכים/התקופות שהשווית** (מהשדה "תאריכי ההשוואה"), כדי שנוכל לאמת.
- תמיד השתמש בכלי report_diagnosis. עברית בלבד.`;

/** מאבחן לקוח בודד ב-AI. מחזיר null אם נכשל. */
export async function diagnoseClient(det: ClientDetection): Promise<Diagnosis | null> {
  try {
    const context = await buildContext(det);
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1300,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "report_diagnosis" },
      messages: [{ role: "user", content: `נתוני הלקוח:\n\n${context}` }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;
    const out = block.input as Diagnosis;
    if (!out.summary || !Array.isArray(out.actions)) return null;
    return { summary: out.summary, severity: out.severity ?? "medium", actions: out.actions.slice(0, 4) };
  } catch (err) {
    console.error(`[Diagnose ${det.clientName}]`, err instanceof Error ? err.message : err);
    return null;
  }
}
