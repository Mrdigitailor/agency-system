// אבחון AI לירידת ביצועים + יצירת משימות פעולה + דיגסט טלגרם.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { getWeeklyClientData } from "@/lib/reports/weekly-data";
import { notifyTaskAssigned } from "@/lib/notifications/task-notify";
import { resolveManagerId } from "@/lib/utils/syncManagers";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
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

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const baseMap = new Map((baseWk?.perCampaign ?? []).map((c) => [key(c), c]));
  const campLines = (recentWk?.perCampaign ?? []).slice(0, 8).map((c) => {
    const b = baseMap.get(key(c));
    const cpa = c.conversions > 0 ? c.spend / c.conversions : 0;
    const bcpa = b && b.conversions > 0 ? b.spend / b.conversions : 0;
    return `- [${c.platform}] ${c.campaignName}: 7 ימים אחרונים — הוצאה ${sym}${Math.round(c.spend)}, ${Math.round(c.conversions)} המרות, CPA ${cpa ? sym + Math.round(cpa) : "—"} | שבוע קודם: CPA ${bcpa ? sym + Math.round(bcpa) : "—"}, ${b ? Math.round(b.conversions) : 0} המרות`;
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
    `- 7 ימים אחרונים: הוצאה ${sym}${Math.round(r.spend)}, ${Math.round(r.conversions)} המרות, CPA ${r.cpa ? sym + Math.round(r.cpa) : "—"}${det.clientType === "ecom" ? `, ROAS ${r.roas.toFixed(1)}` : ""}`,
    `- 7 ימים שלפני כן: הוצאה ${sym}${Math.round(b.spend)}, ${Math.round(b.conversions)} המרות, CPA ${b.cpa ? sym + Math.round(b.cpa) : "—"}${det.clientType === "ecom" ? `, ROAS ${b.roas.toFixed(1)}` : ""}`,
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

const SYSTEM = `אתה מנהל קמפיינים בכיר ומנוסה בסוכנות פרסום דיגיטלי. קיבלת נתוני ביצועים של לקוח שירד. נתח את הירידה, אבחן את הסיבה הסבירה ביותר, והפק רשימת פעולות קונקרטיות וברות-ביצוע להחזרת התוצאות. התבסס רק על הנתונים שקיבלת, היה ספציפי (שמות קמפיינים, מספרים), ואל תמציא נתונים שאין. **כשאתה מזכיר ירידה או עלייה — ציין תמיד את התאריכים/התקופות שעליהם השווית** (הם ניתנים לך בשדה "תאריכי ההשוואה"), כדי שנוכל לאמת. תמיד השתמש בכלי report_diagnosis. עברית בלבד.`;

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

const PRIO_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * יוצר משימות פעולה: מוקצות למנהל הקמפיינר, creator=בעלים (למעקב).
 * dedupeDays: אם ללקוח כבר יש משימת-אבחון פתוחה מהימים האחרונים — מדלגים (מונע הצפה יומית).
 */
export async function createTasksFromDiagnosis(det: ClientDetection, diag: Diagnosis, opts?: { dedupeDays?: number }): Promise<number> {
  const client = await prisma.client.findUnique({ where: { id: det.clientId }, select: { campaignManagerId: true, campaignManager: true } });
  let assigneeId = client?.campaignManagerId ?? null;
  if (!assigneeId && client?.campaignManager) assigneeId = await resolveManagerId(client.campaignManager);
  const [assignee, owner] = await Promise.all([
    assigneeId ? prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } }) : Promise.resolve(null),
    prisma.user.findFirst({ where: { role: "admin", isActive: true }, select: { id: true, name: true } }),
  ]);

  // דדופ: אם כבר יש משימת-אבחון פתוחה של המערכת ללקוח מהימים האחרונים — לא מציפים שוב
  if (opts?.dedupeDays && opts.dedupeDays > 0 && owner?.id) {
    const cutoff = new Date(Date.now() - opts.dedupeDays * 86400000);
    const existing = await prisma.task.count({
      where: { clientId: det.clientId, taskType: "advertising", creatorId: owner.id, status: { not: "done" }, deletedAt: null, createdAt: { gte: cutoff } },
    });
    if (existing > 0) return 0;
  }

  const due = ymd(new Date(Date.now() + 3 * 86400000));
  const actions = [...diag.actions].sort((a, b) => (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2)).slice(0, 3);

  let created = 0;
  for (const a of actions) {
    const description = `${a.detail}${a.campaign ? `\nקמפיין: ${a.campaign}` : ""}\n\n📅 נותח: ${datesLabel()}\n🔎 אבחון אוטומטי: ${diag.summary}`;
    const task = await prisma.task.create({
      data: {
        title: a.title,
        description,
        clientId: det.clientId,
        assigneeId,
        assignee: assignee?.name ?? "",
        creatorId: owner?.id ?? null,
        priority: a.priority,
        dueDate: due,
        status: "pending",
        taskType: "advertising",
        platform: a.platform ?? "",
      },
    });
    created++;
    if (assigneeId && owner?.id && assigneeId !== owner.id) {
      await notifyTaskAssigned({
        taskId: task.id, taskTitle: task.title, taskDescription: description, taskDueDate: due, taskPriority: a.priority,
        clientId: det.clientId, assigneeId, creatorId: owner.id, creatorName: owner.name ?? "אבחון אוטומטי",
      }).catch(() => {});
    }
  }
  return created;
}

const SEV_EMOJI: Record<string, string> = { high: "🔴", medium: "🟠", low: "🟡" };

/** בונה את טקסט הדיגסט לבעלים */
export function buildTelegramDigest(items: Array<{ det: ClientDetection; diag: Diagnosis }>): string {
  if (items.length === 0) return "🌅 בוקר טוב! כל הלקוחות יציבים — לא זוהו ירידות ביצועים משמעותיות היום. 👍";
  const lines = [`🌅 בוקר טוב! ${items.length} לקוחות דורשים תשומת לב היום:`, ""];
  for (const { det, diag } of items) {
    lines.push(`${SEV_EMOJI[diag.severity] ?? "🟠"} *${det.clientName}*`);
    lines.push(diag.summary);
    if (diag.actions[0]) lines.push(`▪️ ${diag.actions[0].title}`);
    lines.push("");
  }
  lines.push("המשימות המלאות נכנסו למערכת ושויכו למנהלים.");
  return lines.join("\n");
}

/** שולח דיגסט לבעלים (chat id מ-env או מרשימת המורשים) */
export async function sendOwnerDigest(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID ?? (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",")[0]?.trim();
  if (!chatId) {
    console.warn("[Diagnose] אין TELEGRAM_OWNER_CHAT_ID — דיגסט לא נשלח");
    return;
  }
  await sendTelegramMessage(chatId, text).catch((e) => console.error("[Diagnose] telegram digest failed:", e));
}
