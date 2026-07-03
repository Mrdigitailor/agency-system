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
  rootCause?: string;
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

  const PLAT_LABEL: Record<string, string> = { meta: "Meta", google: "Google Ads", tiktok: "TikTok" };
  const key = (c: { platform: string; campaignName: string }) => `${c.platform}|${c.campaignName}`;
  const ctrOf = (imp: number, clk: number) => (imp > 0 ? (clk / imp) * 100 : 0);
  const cpmOf = (imp: number, spend: number) => (imp > 0 ? (spend / imp) * 1000 : 0);
  const crOf = (clk: number, conv: number) => (clk > 0 ? (conv / clk) * 100 : 0);
  const baseMap = new Map((baseWk?.perCampaign ?? []).map((c) => [key(c), c]));
  const campLines = (recentWk?.perCampaign ?? []).slice(0, 10).map((c) => {
    const b = baseMap.get(key(c));
    const cpa = c.conversions > 0 ? c.spend / c.conversions : 0;
    const bcpa = b && b.conversions > 0 ? b.spend / b.conversions : 0;
    // recent vs baseline — CTR (רלוונטיות/שחיקה), CPM (עלות מכרז/תחרות), יחס-המרה (דף/הצעה/טראקינג)
    const parts = [
      `הוצאה ${sym}${Math.round(c.spend)} (קודם ${sym}${Math.round(b?.spend ?? 0)})`,
      `${Math.round(c.conversions)} המרות (קודם ${Math.round(b?.conversions ?? 0)})`,
      `CPA ${cpa ? sym + Math.round(cpa) : "—"} (קודם ${bcpa ? sym + Math.round(bcpa) : "—"})`,
      `CTR ${ctrOf(c.impressions, c.clicks).toFixed(2)}% (קודם ${b ? ctrOf(b.impressions, b.clicks).toFixed(2) : "—"}%)`,
      `CPM ${sym}${cpmOf(c.impressions, c.spend).toFixed(0)} (קודם ${sym}${b ? cpmOf(b.impressions, b.spend).toFixed(0) : "—"})`,
      `יחס-המרה ${crOf(c.clicks, c.conversions).toFixed(1)}% (קודם ${b ? crOf(b.clicks, b.conversions).toFixed(1) : "—"}%)`,
    ];
    return `- פלטפורמה=${PLAT_LABEL[c.platform] ?? c.platform} | קמפיין="${c.campaignName}"\n    ${parts.join(" · ")}`;
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
    `- 7 ימים אחרונים: הוצאה ${sym}${Math.round(r.spend)}, ${Math.round(r.conversions)} המרות, CPA ${r.cpa ? sym + Math.round(r.cpa) : "—"}, CTR ${r.ctr.toFixed(2)}%, CPM ${sym}${r.impressions > 0 ? Math.round((r.spend / r.impressions) * 1000) : 0}${det.clientType === "ecom" ? `, ROAS ${r.roas.toFixed(1)}` : ""}`,
    `- 7 ימים שלפני כן: הוצאה ${sym}${Math.round(b.spend)}, ${Math.round(b.conversions)} המרות, CPA ${b.cpa ? sym + Math.round(b.cpa) : "—"}, CTR ${b.ctr.toFixed(2)}%, CPM ${sym}${b.impressions > 0 ? Math.round((b.spend / b.impressions) * 1000) : 0}${det.clientType === "ecom" ? `, ROAS ${b.roas.toFixed(1)}` : ""}`,
    `- החודש עד היום: הוצאה ${sym}${Math.round(det.mtdSpend)}, CPA ${det.mtdCpa ? sym + Math.round(det.mtdCpa) : "—"}${det.targetCpa > 0 ? ` (יעד ${sym}${Math.round(det.targetCpa)})` : ""}`,
    ``,
    `קמפיינים (7 ימים אחרונים מול שבוע קודם) — העתק שמות קמפיינים מכאן בדיוק, כולל המרכאות:`,
    campLines || "- (אין פירוט קמפיינים)",
  ].join("\n");
}

const TOOL: Anthropic.Tool = {
  name: "report_diagnosis",
  description: "מדווח אבחון של ירידת ביצועים + רשימת פעולות מדורגת לתיקון",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-4 משפטים בעברית: מה ירד, ו**הסיבה הסבירה ביותר** מבוססת-נתונים (המנגנון — למשל שחיקת קריאייטיב / התייקרות מכרז / צניחת יחס-המרה / בעיית טראקינג). זה החלק הכי חשוב." },
      rootCause: { type: "string", description: "הסיבה השורשית בשורה אחת: המנגנון + המדד שמוכיח אותו (למשל: 'שחיקת קריאייטיב — CTR צנח מ-2.1% ל-1.2% ו-CPM עלה 18%')" },
      severity: { type: "string", enum: ["low", "medium", "high"], description: "חומרת המצב" },
      actions: {
        type: "array",
        description: "עד 4 פעולות קונקרטיות שנובעות מהסיבה שזיהית, מהחשובה לפחות",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "צעד ביצוע קצר וברור (לדוגמה: 'החלף קריאייטיב באדסט')" },
            detail: { type: "string", description: "**הסיבה** (המנגנון + הנתון שמוכיח) + מה הצעד צפוי לתקן. לא 'בדוק אם'." },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            platform: { type: "string", enum: ["Meta", "Google Ads", "TikTok"], description: "הפלטפורמה של הקמפיין — חובה כשהפעולה מתייחסת לקמפיין ספציפי" },
            campaign: { type: "string", description: "שם הקמפיין המדויק, מועתק מילה-במילה מרשימת הקמפיינים (בלי לקצר/לתרגם/לשנות). אם אינך בטוח בשם המדויק — השאר ריק." },
          },
          required: ["title", "detail", "priority"],
        },
      },
    },
    required: ["summary", "rootCause", "severity", "actions"],
  },
};

const SYSTEM = `אתה אנליסט-על ומנהל קמפיינים בכיר בסוכנות פרסום דיגיטלי. קיבלת נתוני ביצועים מלאים של לקוח שירד — פר-פלטפורמה ופר-קמפיין, שבוע אחרון מול הקודם: הוצאה, המרות, CPA, CTR, CPM, יחס-המרה, חשיפות.

**התפקיד המרכזי שלך הוא לאבחן את הסיבה השורשית — לא רק להצביע על הבעיה.** "ה-CPA עלה" זה תסמין. אתה חייב להגיד **למה**. השתמש בנתונים כדי להסיק את המנגנון:
- **CTR יורד** (+ לרוב CPM עולה) → שחיקת קריאייטיב / עייפות קהל. הפעולה: רענון קריאייטיב / רענון קהל, לא חיתוך תקציב.
- **CPM עולה בחדות** ו-CTR יציב → התייקרות מכרז / תחרות / קהל צר מדי / עונתיות.
- **יחס-המרה צונח** (קליקים יציבים אבל המרות יורדות) → בעיה בדף הנחיתה / ההצעה / או **תקלת טראקינג/פיקסל** (במיוחד אם המרות צנחו לאפס פתאום).
- **חשיפות/הוצאה צונחות** → בעיית delivery: תקציב נגמר, הצעת מחיר נמוכה, קמפיין נעצר, או learning phase.
- **קמפיין ספציפי מושך את הממוצע למטה** → זהה אותו בשם ותן פעולה ממוקדת אליו.

**אסור לחלוטין:** "חתוך תקציב עד שתזהה את הבעיה" / "בדוק / בחן / שים לב ל...". זו בדיוק העבודה שלך — אתה כבר זיהית. אם אין ודאות מלאה, תן את ההשערה הכי סבירה מהנתונים + הפעולה שנובעת ממנה, ותנמק.

חובה בכל פעולה שמתייחסת לקמפיין:
- **שם קמפיין מדויק** — העתק מילה-במילה מרשימת הקמפיינים (בין המרכאות). אל תקצר, תתרגם או תמציא. אם לא בטוח — אל תנקוב בשם.
- **פלטפורמה** — Meta / Google Ads / TikTok (מהשדה "פלטפורמה=" של אותו קמפיין).

תמיד ציין את התאריכים שהשווית (מ"תאריכי ההשוואה"). התבסס רק על הנתונים. תמיד השתמש בכלי report_diagnosis. עברית בלבד.`;

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
    return { summary: out.summary, rootCause: out.rootCause, severity: out.severity ?? "medium", actions: out.actions.slice(0, 4) };
  } catch (err) {
    console.error(`[Diagnose ${det.clientName}]`, err instanceof Error ? err.message : err);
    return null;
  }
}
