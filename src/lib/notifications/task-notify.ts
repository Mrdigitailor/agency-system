// התראות + מיילים על משימות חדשות / שינוי שיוך

import { prisma } from "@/lib/db/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const PRIORITY_LABELS: Record<string, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  urgent: "דחוף",
};

interface TaskNotifyParams {
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  taskDueDate: string;
  taskPriority: string;
  clientId: string | null;
  assigneeId: string;    // ה-user שמקבל את המשימה
  creatorId: string;     // ה-user שיצר/עדכן
  creatorName: string;
  baseUrl?: string;
}

/**
 * יוצר התראה + שולח מייל לעובד שקיבל משימה חדשה.
 * לא שולח אם העובד יצר לעצמו.
 */
export async function notifyTaskAssigned(params: TaskNotifyParams) {
  const {
    taskTitle, taskDescription, taskDueDate, taskPriority,
    clientId, assigneeId, creatorId, creatorName,
    baseUrl = "https://agency.mr-digitailor.co.il",
  } = params;

  // לא לשלוח אם העובד יצר לעצמו
  if (assigneeId === creatorId) {
    console.log("[TaskNotify] Assignee is creator — skipping notification");
    return;
  }

  // שלוף פרטי עובד + לקוח
  const [assignee, client] = await Promise.all([
    prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true, email: true } }),
    clientId ? prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null,
  ]);

  if (!assignee) {
    console.warn("[TaskNotify] Assignee not found:", assigneeId);
    return;
  }

  const clientName = client?.name ?? "";
  const link = clientId ? `/clients/${clientId}?tab=tasks` : "/tasks";

  // 1. יצירת התראה ב-DB
  try {
    await prisma.alert.create({
      data: {
        type: "new_task",
        title: `משימה חדשה: ${taskTitle}`,
        message: taskDescription || `מ-${creatorName}${clientName ? ` · ${clientName}` : ""}`,
        link,
        userId: assigneeId,
        clientId: clientId || null,
      },
    });
    console.log(`[TaskNotify] Alert created for ${assignee.name}`);
  } catch (err) {
    console.error("[TaskNotify] Failed to create alert:", err);
  }

  // 2. שליחת מייל
  if (!assignee.email) {
    console.warn("[TaskNotify] No email for assignee — skipping email");
    return;
  }

  const dueDateFormatted = taskDueDate
    ? new Date(taskDueDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "לא הוגדר";
  const priorityLabel = PRIORITY_LABELS[taskPriority] ?? taskPriority;
  const taskUrl = `${baseUrl}${link}`;

  try {
    const result = await resend.emails.send({
      from: "DigiTailors <onboarding@resend.dev>",
      to: assignee.email,
      subject: `משימה חדשה: ${taskTitle}${clientName ? ` — ${clientName}` : ""}`,
      html: taskEmailTemplate({
        assigneeName: assignee.name,
        creatorName,
        taskTitle,
        taskDescription,
        clientName,
        dueDate: dueDateFormatted,
        priority: priorityLabel,
        taskUrl,
      }),
    });

    if (result.error) {
      console.error("[TaskNotify] Email error:", result.error);
    } else {
      console.log(`[TaskNotify] Email sent to ${assignee.email}, id=${result.data?.id}`);
    }
  } catch (err) {
    console.error("[TaskNotify] Email exception:", err);
  }
}

function taskEmailTemplate(p: {
  assigneeName: string;
  creatorName: string;
  taskTitle: string;
  taskDescription: string;
  clientName: string;
  dueDate: string;
  priority: string;
  taskUrl: string;
}) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background-color:#000000;padding:24px;text-align:center;">
          <h1 style="color:#eed89b;margin:0;font-size:22px;">DigiTailors</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 28px;">
          <h2 style="color:#000000;margin:0 0 16px;font-size:18px;">שלום ${p.assigneeName},</h2>
          <p style="color:#666666;font-size:15px;line-height:1.6;margin:0 0 20px;">
            ${p.creatorName} הוסיף/ה לך משימה חדשה:
          </p>
          <div style="background-color:#f5f5f5;border-radius:8px;padding:20px;margin:0 0 24px;border-right:4px solid #eed89b;">
            <p style="color:#000000;font-size:16px;margin:0 0 12px;font-weight:bold;">${p.taskTitle}</p>
            ${p.clientName ? `<p style="color:#666;font-size:14px;margin:0 0 8px;">לקוח: <strong style="color:#000;">${p.clientName}</strong></p>` : ""}
            ${p.taskDescription ? `<p style="color:#666;font-size:14px;margin:0 0 8px;">תיאור: ${p.taskDescription}</p>` : ""}
            <p style="color:#666;font-size:14px;margin:0 0 4px;">תאריך יעד: <strong style="color:#000;">${p.dueDate}</strong></p>
            <p style="color:#666;font-size:14px;margin:0;">עדיפות: <strong style="color:#000;">${p.priority}</strong></p>
          </div>
          <div style="text-align:center;margin:24px 0;">
            <a href="${p.taskUrl}" style="display:inline-block;background-color:#eed89b;color:#000000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
              צפייה במשימה
            </a>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#f5f5f5;padding:16px 28px;text-align:center;">
          <p style="color:#999999;font-size:11px;margin:0;">DigiTailors Agency System</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
