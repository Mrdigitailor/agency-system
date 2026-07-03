// זרימת אישור בטלגרם: כל פעולה מאבחון נשלחת עם כפתורי "אשר כמשימה" / "הערות".
// אישור → משימה. הערות → המשתמש כותב, ה-AI מנסח מחדש, ושוב מציעים לאשר.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { notifyTaskAssigned } from "@/lib/notifications/task-notify";
import { resolveManagerId } from "@/lib/utils/syncManagers";
import { sendTelegramMessage, sendTelegramWithButtons, type InlineKeyboard } from "@/lib/api/telegram/client";
import { datesLabel, type ClientDetection } from "./detect";
import type { Diagnosis } from "./diagnose";

const MODEL = process.env.DIAGNOSIS_AI_MODEL ?? "claude-sonnet-4-6";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SEV_EMOJI: Record<string, string> = { high: "🔴", medium: "🟠", low: "🟡" };
const PRIO_LABEL: Record<string, string> = { urgent: "דחוף", high: "גבוהה", medium: "בינונית", low: "נמוכה" };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ownerChatId(): string | null {
  return process.env.TELEGRAM_OWNER_CHAT_ID ?? ((process.env.TELEGRAM_ALLOWED_USER_IDS ?? "").split(",")[0]?.trim() || null);
}

export function draftKeyboard(id: string): InlineKeyboard {
  return {
    inline_keyboard: [[
      { text: "✅ אשר כמשימה", callback_data: `ok:${id}` },
      { text: "💬 הערות", callback_data: `note:${id}` },
    ]],
  };
}
export function approvedKeyboard(): InlineKeyboard {
  return { inline_keyboard: [[{ text: "✅ אושר — משימה נוצרה", callback_data: "done" }]] };
}

function draftText(d: { clientName: string; severity: string; title: string; detail: string; priority: string; datesInfo: string; platform?: string; campaign?: string }): string {
  const parts = [d.platform, d.campaign ? `"${d.campaign}"` : ""].filter(Boolean);
  const loc = parts.length ? `\n📍 ${parts.join(" · ")}` : "";
  return `${SEV_EMOJI[d.severity] ?? "🟠"} ${d.clientName}\n\n▪️ ${d.title}${loc}\n${d.detail}\n\n📅 נותח: ${d.datesInfo}\n🔸 עדיפות: ${PRIO_LABEL[d.priority] ?? d.priority}`;
}
export function draftTextById(d: { clientName: string; severity: string; title: string; detail: string; priority: string; datesInfo: string }): string {
  return draftText(d);
}

/** שולח לאישור בטלגרם — הודעה אחת מסכמת לכל לקוח. מחזיר כמה הודעות **נמסרו בפועל** (לא נספרות טיוטות). */
export async function sendDiagnosesForApproval(items: Array<{ det: ClientDetection; diag: Diagnosis }>): Promise<number> {
  const chat = ownerChatId();
  if (!chat) { console.error("[Approval] ⚠️ אין owner chat (TELEGRAM_OWNER_CHAT_ID / ALLOWED_USER_IDS) — לא נשלח כלום"); return 0; }
  const dates = datesLabel();

  if (items.length === 0) {
    await sendTelegramMessage(chat, "🌅 בוקר טוב! כל הלקוחות יציבים — לא זוהו ירידות ביצועים משמעותיות היום. 👍");
    return 0;
  }
  const leadOk = await sendTelegramMessage(chat, `🌅 בוקר טוב! זוהו ${items.length} לקוחות בירידה.\n📅 השוואה: ${dates}\n\nלכל לקוח — סיכום ופעולות. אשר כל פעולה כמשימה, או שלח הערה לחידוד.`);
  if (!leadOk) console.error("[Approval] ⚠️ שליחת הודעת הפתיחה נכשלה — בדוק TELEGRAM_BOT_TOKEN בשרת");

  let delivered = 0;
  for (const { det, diag } of items) {
    const actions = diag.actions.slice(0, 3);
    // הסיבה השורשית נשמרת עם האבחון (לצורך חידוד + תיאור המשימה)
    const fullSummary = diag.rootCause ? `${diag.summary}\n🔍 סיבה: ${diag.rootCause}` : diag.summary;
    const drafts = [];
    for (const a of actions) {
      const d = await prisma.actionDraft.create({
        data: {
          clientId: det.clientId, clientName: det.clientName, summary: fullSummary, severity: diag.severity,
          title: a.title, detail: a.detail, priority: a.priority, platform: a.platform ?? "", campaign: a.campaign ?? "",
          datesInfo: dates, chatId: chat,
        },
      });
      drafts.push(d);
    }
    const emoji = SEV_EMOJI[diag.severity] ?? "🟠";
    const loc = (d: { platform: string; campaign: string }) => {
      const parts = [d.platform, d.campaign ? `"${d.campaign}"` : ""].filter(Boolean);
      return parts.length ? `\n📍 ${parts.join(" · ")}` : "";
    };
    const body = drafts.map((d, i) => `${i + 1}. ${d.title}${loc(d)}\n${d.detail}`).join("\n\n");
    const text = `${emoji} ${det.clientName}\n${fullSummary}\n📅 נותח: ${dates}\n\n${body}`;
    const keyboard: InlineKeyboard = {
      inline_keyboard: drafts.map((d, i) => [
        { text: `✅ אשר ${i + 1}`, callback_data: `ok:${d.id}` },
        { text: `💬 הערה ${i + 1}`, callback_data: `note:${d.id}` },
      ]),
    };
    const messageId = await sendTelegramWithButtons(chat, text, keyboard);
    if (messageId) delivered += drafts.length;
    else console.error(`[Approval] ⚠️ שליחת אבחון ל-${det.clientName} נכשלה (טיוטות נוצרו אך ההודעה לא נמסרה)`);
  }
  console.log(`[Approval] delivered ${delivered} actions across ${items.length} clients`);
  return delivered;
}

/** אישור טיוטה → יצירת משימה (מוקצית למנהל, creator=בעלים). */
export async function createTaskFromDraft(draftId: string): Promise<boolean> {
  const d = await prisma.actionDraft.findUnique({ where: { id: draftId } });
  if (!d || d.status === "approved") return false;

  const client = await prisma.client.findUnique({ where: { id: d.clientId }, select: { campaignManagerId: true, campaignManager: true } });
  let assigneeId = client?.campaignManagerId ?? null;
  if (!assigneeId && client?.campaignManager) assigneeId = await resolveManagerId(client.campaignManager);
  const [assignee, owner] = await Promise.all([
    assigneeId ? prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } }) : Promise.resolve(null),
    prisma.user.findFirst({ where: { role: "admin", isActive: true }, select: { id: true, name: true } }),
  ]);

  const due = ymd(new Date(Date.now() + 3 * 86400000));
  const locLine = [d.platform, d.campaign ? `"${d.campaign}"` : ""].filter(Boolean).join(" · ");
  const description = `${d.detail}${locLine ? `\n📍 ${locLine}` : ""}\n\n📅 נותח: ${d.datesInfo}\n🔎 אבחון: ${d.summary}`;
  const task = await prisma.task.create({
    data: {
      title: d.title, description, clientId: d.clientId, assigneeId, assignee: assignee?.name ?? "",
      creatorId: owner?.id ?? null, priority: d.priority, dueDate: due, status: "pending", taskType: "advertising", platform: d.platform,
    },
  });
  await prisma.actionDraft.update({ where: { id: draftId }, data: { status: "approved", awaitingNotes: false } });

  if (assigneeId && owner?.id && assigneeId !== owner.id) {
    await notifyTaskAssigned({
      taskId: task.id, taskTitle: task.title, taskDescription: description, taskDueDate: due, taskPriority: d.priority,
      clientId: d.clientId, assigneeId, creatorId: owner.id, creatorName: owner.name ?? "אבחון אוטומטי",
    }).catch(() => {});
  }
  return true;
}

const REVISE_TOOL: Anthropic.Tool = {
  name: "revise_action",
  description: "מנסח מחדש פעולה מומלצת לפי הערת בעל הסוכנות",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "כותרת הפעולה המעודכנת" },
      detail: { type: "string", description: "פירוט מעודכן + נתונים תומכים" },
      priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    },
    required: ["title", "detail", "priority"],
  },
};

/** חידוד טיוטה לפי הערת המשתמש. מחזיר את הטקסט המעודכן לשליחה, או null. */
export async function refineDraft(draftId: string, note: string): Promise<string | null> {
  const d = await prisma.actionDraft.findUnique({ where: { id: draftId } });
  if (!d) return null;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: `אתה מנהל קמפיינים בכיר. קיבלת פעולה מומלצת ללקוח, והערה של בעל הסוכנות עליה. נסח מחדש את הפעולה לפי ההערה — עדכן כותרת/פירוט/עדיפות בהתאם למה שביקש. הפעולה חייבת להיות **מסקנה סופית + צעד ביצוע קונקרטי**, לעולם לא "בדוק/בחן" מדד. שמור על ספציפיות, מספרים ותאריכים. השתמש בכלי revise_action. עברית בלבד.`,
      tools: [REVISE_TOOL],
      tool_choice: { type: "tool", name: "revise_action" },
      messages: [{
        role: "user",
        content: `לקוח: ${d.clientName}\nאבחון: ${d.summary}\nתאריכים שנותחו: ${d.datesInfo}\n\nהפעולה הנוכחית:\nכותרת: ${d.title}\nפירוט: ${d.detail}\nעדיפות: ${d.priority}\n\nהערת בעל הסוכנות: "${note}"\n\nנסח מחדש את הפעולה בהתאם להערה.`,
      }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;
    const out = block.input as { title: string; detail: string; priority: string };
    await prisma.actionDraft.update({ where: { id: draftId }, data: { title: out.title, detail: out.detail, priority: out.priority, awaitingNotes: false } });
    return draftText({ clientName: d.clientName, severity: d.severity, title: out.title, detail: out.detail, priority: out.priority, datesInfo: d.datesInfo, platform: d.platform, campaign: d.campaign });
  } catch (err) {
    console.error("[refineDraft]", err instanceof Error ? err.message : err);
    return null;
  }
}
