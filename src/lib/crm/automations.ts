import { prisma } from "@/lib/db/prisma";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";
import { todayIL, shiftYmd } from "@/lib/utils/ildate";

/** סטטוסים "פתוחים" — ליד פעיל בתהליך מכירה שחייב צעד הבא */
export const OPEN_LEAD_STATUSES = ["new", "contacted", "meeting_set", "proposal_sent", "negotiation"];

const STATUS_LABELS: Record<string, string> = {
  new: "חדש",
  contacted: "נוצר קשר",
  meeting_set: "נקבעה פגישה",
  proposal_sent: "נשלחה הצעה",
  negotiation: "משא ומתן",
  won: "נסגר",
  lost: "אבד",
  churned: "נוטש",
};

/** כמה ימים ליד יכול לשבת בסטטוס לפני שהוא נחשב "תקוע" */
export const STAGE_ROT_DAYS: Record<string, number> = {
  new: 1, // ליד חדש בלי מגע יום אחד = דחוף (speed-to-lead)
  contacted: 5,
  meeting_set: 7,
  proposal_sent: 7,
  negotiation: 10,
};

export const NEXT_ACTION_LABELS: Record<string, string> = {
  call: "שיחה",
  meeting: "פגישה",
  followup: "פולו-אפ",
  proposal: "הצעת מחיר",
  other: "אחר",
};

/** התראת טלגרם מיידית על ליד חדש — מענה תוך 5 דקות = פי 21 סיכוי לסגירה */
export async function notifyNewLead(lead: { name: string; company: string; phone: string; email: string; source: string; estimatedBudget: string }): Promise<void> {
  const chat = ownerChatId();
  if (!chat) return;
  const lines = [
    `🔥 ליד חדש נכנס: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
    lead.phone ? `📞 ${lead.phone}` : "",
    lead.email ? `📧 ${lead.email}` : "",
    lead.source ? `📍 מקור: ${lead.source}` : "",
    lead.estimatedBudget ? `💰 תקציב משוער: ${lead.estimatedBudget}` : "",
    "",
    "⚡ מענה תוך 5 דקות מכפיל פי 21 את הסיכוי לסגירה",
  ].filter((l) => l !== null);
  await sendTelegramMessage(chat, lines.filter(Boolean).join("\n"));
}

/**
 * דיגסט CRM לבוקר: לידים בלי צעד הבא, צעדים באיחור, לידים תקועים בשלב.
 * מוחזר null אם אין מה לדווח.
 */
export async function buildCrmDigest(): Promise<string | null> {
  const today = todayIL();
  const leads = await prisma.lead.findMany({
    where: { status: { in: OPEN_LEAD_STATUSES } },
    select: { id: true, name: true, company: true, status: true, nextFollowUp: true, nextActionType: true, stageChangedAt: true, createdAt: true },
  });
  if (leads.length === 0) return null;

  // לידים "טריים" בלבד מפורטים בדיגסט — הערמה הישנה (יבוא ממאנדיי וכו') מסתכמת בשורה אחת,
  // אחרת הדיגסט מוצף ב-139 לידים בני שנתיים ואף אחד לא קורא אותו.
  const FRESH_DAYS = 60;
  const isFresh = (l: { stageChangedAt: string; createdAt: Date }) => {
    const since = l.stageChangedAt || l.createdAt.toISOString().slice(0, 10);
    return (new Date(today).getTime() - new Date(since).getTime()) / 86400000 <= FRESH_DAYS;
  };

  const noAction: string[] = [];
  const overdue: string[] = [];
  const stale: string[] = [];
  let legacyCount = 0;

  // מהחדש לישן — שהדיגסט יפתח בלידים הכי אקטואליים
  leads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const l of leads) {
    const label = `${l.name}${l.company ? ` (${l.company})` : ""}`;
    const statusHe = STATUS_LABELS[l.status] ?? l.status;
    const fresh = isFresh(l);

    if (!fresh) {
      // ליד ישן שעדיין "פתוח" — נספר אבל לא מפורט
      if (!l.nextFollowUp || l.nextFollowUp < today) legacyCount++;
      continue;
    }

    if (!l.nextFollowUp) {
      noAction.push(`• ${label} — ${statusHe}`);
    } else if (l.nextFollowUp < today) {
      const days = Math.round((new Date(today).getTime() - new Date(l.nextFollowUp).getTime()) / 86400000);
      overdue.push(`• ${label} — ${NEXT_ACTION_LABELS[l.nextActionType] ?? "צעד"} באיחור של ${days} ימים`);
    }

    // תקוע בשלב מעבר לסף
    const rotDays = STAGE_ROT_DAYS[l.status];
    const sinceStr = l.stageChangedAt || l.createdAt.toISOString().slice(0, 10);
    if (rotDays !== undefined) {
      const inStage = Math.round((new Date(today).getTime() - new Date(sinceStr).getTime()) / 86400000);
      if (inStage > rotDays) {
        stale.push(`• ${label} — ${inStage} ימים ב"${statusHe}" (סף: ${rotDays})`);
      }
    }
  }

  // לידים אבודים שהגיע מועד ההחייאה שלהם (חלון 14 יום — שלא יישארו לנצח בדיגסט)
  const revivalWindow = shiftYmd(today, -14);
  const revivals = await prisma.lead.findMany({
    where: { status: "lost", nextFollowUp: { gte: revivalWindow, lte: today } },
    select: { name: true, company: true, closeReason: true },
    take: 8,
  });
  const revival = revivals.map((l) => {
    const REASON_HE: Record<string, string> = { price: "מחיר", timing: "תזמון", competitor: "מתחרה", no_budget: "אין תקציב" };
    return `• ${l.name}${l.company ? ` (${l.company})` : ""} — אבד בגלל ${REASON_HE[l.closeReason] ?? (l.closeReason || "?")}, הגיע הזמן לבדוק שוב`;
  });

  if (noAction.length === 0 && overdue.length === 0 && stale.length === 0 && legacyCount === 0 && revival.length === 0) return null;

  const parts: string[] = ["📇 CRM — דורש טיפול היום:"];
  if (overdue.length > 0) parts.push(`\n⏰ צעדים באיחור (${overdue.length}):\n${overdue.slice(0, 8).join("\n")}`);
  if (noAction.length > 0) parts.push(`\n🚨 לידים בלי צעד הבא (${noAction.length}):\n${noAction.slice(0, 8).join("\n")}`);
  if (stale.length > 0) parts.push(`\n🐌 תקועים בשלב (${stale.length}):\n${stale.slice(0, 8).join("\n")}`);
  if (revival.length > 0) parts.push(`\n🔁 לידים להחייאה (${revival.length}):\n${revival.join("\n")}`);
  if (legacyCount > 0) parts.push(`\n🗄 בנוסף: ${legacyCount} לידים ישנים (מעל ${FRESH_DAYS} יום) פתוחים בלי טיפול — שווה לעבור עליהם ולסגור/להחיות`);
  return parts.join("\n");
}

/** שולח את דיגסט ה-CRM לבעלים (אם יש מה לדווח) */
export async function sendCrmDigest(): Promise<boolean> {
  const chat = ownerChatId();
  if (!chat) return false;
  const digest = await buildCrmDigest();
  if (!digest) return false;
  return sendTelegramMessage(chat, digest);
}

/** ברירת מחדל לצעד הבא כשליד עובר סטטוס — שומר על החוק "תמיד יש צעד הבא" */
export function defaultNextActionForStatus(status: string): { nextActionType: string; nextFollowUp: string; nextActionNote: string } | null {
  const today = todayIL();
  switch (status) {
    case "new":
      return { nextActionType: "call", nextFollowUp: today, nextActionNote: "יצירת קשר ראשוני עם הליד" };
    case "proposal_sent":
      // פולו-אפ אחרי 48 שעות — "לשלוח הצעה ולהיעלם" היא טעות המכירה #1
      return { nextActionType: "followup", nextFollowUp: shiftYmd(today, 2), nextActionNote: "פולו-אפ על ההצעה (48 שעות מהשליחה)" };
    case "contacted":
      return { nextActionType: "followup", nextFollowUp: shiftYmd(today, 2), nextActionNote: "המשך תיאום — קביעת פגישה" };
    case "negotiation":
      return { nextActionType: "followup", nextFollowUp: shiftYmd(today, 2), nextActionNote: "המשך משא ומתן" };
    default:
      return null;
  }
}
