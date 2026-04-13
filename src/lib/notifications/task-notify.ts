// התראות + מיילים על משימות חדשות / שינוי שיוך

import { prisma } from "@/lib/db/prisma";
import { Resend } from "resend";

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
  assigneeId: string;
  creatorId: string;
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

  console.log(`\n=== [TaskNotify] START ===`);
  console.log(`[TaskNotify] Task: "${taskTitle}"`);
  console.log(`[TaskNotify] assigneeId: ${assigneeId}`);
  console.log(`[TaskNotify] creatorId: ${creatorId} (${creatorName})`);
  console.log(`[TaskNotify] clientId: ${clientId}`);

  // לא לשלוח אם העובד יצר לעצמו
  if (assigneeId === creatorId) {
    console.log("[TaskNotify] SKIP — assignee is creator (self-assignment)");
    return;
  }

  // שלוף פרטי עובד + לקוח
  const [assignee, client] = await Promise.all([
    prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true, email: true } }),
    clientId ? prisma.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null,
  ]);

  console.log(`[TaskNotify] Assignee found: ${assignee ? `${assignee.name} <${assignee.email}>` : "NOT FOUND"}`);
  console.log(`[TaskNotify] Client found: ${client?.name ?? "(no client)"}`);

  if (!assignee) {
    console.warn("[TaskNotify] ABORT — assignee not found in DB");
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
    console.log(`[TaskNotify] Alert CREATED for ${assignee.name}`);
  } catch (err) {
    console.error("[TaskNotify] Alert creation FAILED:", err);
  }

  // 2. שליחת מייל
  if (!assignee.email) {
    console.warn("[TaskNotify] SKIP email — assignee has no email address");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  console.log(`[TaskNotify] RESEND_API_KEY: ${apiKey ? `${apiKey.slice(0, 10)}... (len=${apiKey.length})` : "❌ NOT SET"}`);

  if (!apiKey) {
    console.error("[TaskNotify] ABORT email — RESEND_API_KEY not configured");
    return;
  }

  const resend = new Resend(apiKey);

  const dueDateFormatted = taskDueDate
    ? new Date(taskDueDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "לא הוגדר";
  const priorityLabel = PRIORITY_LABELS[taskPriority] ?? taskPriority;
  const taskUrl = `${baseUrl}${link}`;

  const emailPayload = {
    from: "DigiTailors <onboarding@resend.dev>",
    to: assignee.email,
    subject: `משימה חדשה: ${taskTitle}${clientName ? ` — ${clientName}` : ""}`,
  };

  // Resend sandbox: יכול לשלוח רק לבעל החשבון.
  // אם הדומיין לא מאומת — שולח לבעלים עם ציון שם הנמען בנושא.
  // אחרי אימות דומיין ב-resend.com/domains — אפשר לשלוח לכולם.
  const OWNER_EMAIL = "saar@digitailors.co.il";
  const isDomainVerified = emailPayload.from.includes("@digitailors.co.il");
  const actualTo = isDomainVerified ? emailPayload.to : OWNER_EMAIL;
  const actualSubject = isDomainVerified
    ? emailPayload.subject
    : `[עבור ${assignee.name}] ${emailPayload.subject}`;

  console.log(`[TaskNotify] Sending email:`);
  console.log(`  from: ${emailPayload.from}`);
  console.log(`  to: ${actualTo} (original: ${emailPayload.to}, domainVerified: ${isDomainVerified})`);
  console.log(`  subject: ${actualSubject}`);

  try {
    const result = await resend.emails.send({
      from: emailPayload.from,
      to: actualTo,
      subject: actualSubject,
      html: taskEmailTemplate({
        assigneeName: assignee.name,
        creatorName,
        taskTitle,
        taskDescription,
        clientName,
        clientId: clientId ?? "",
        dueDate: dueDateFormatted,
        priority: priorityLabel,
        taskUrl,
      }),
    });

    console.log(`[TaskNotify] Resend response:`, JSON.stringify(result, null, 2));

    if (result.error) {
      console.error(`[TaskNotify] Email FAILED:`, result.error.message ?? JSON.stringify(result.error));
    } else {
      console.log(`[TaskNotify] Email SENT to ${assignee.email}, id=${result.data?.id}`);
    }
  } catch (err) {
    console.error("[TaskNotify] Email EXCEPTION:", err);
  }

  console.log(`=== [TaskNotify] END ===\n`);
}

function taskEmailTemplate(p: {
  assigneeName: string;
  creatorName: string;
  taskTitle: string;
  taskDescription: string;
  clientName: string;
  clientId: string;
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
        <tr><td style="background-color:#000000;padding:24px;text-align:center;">
          <h1 style="color:#eed89b;margin:0;font-size:22px;">DigiTailors</h1>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <h2 style="color:#000000;margin:0 0 16px;font-size:18px;">שלום ${p.assigneeName},</h2>
          <p style="color:#666666;font-size:15px;line-height:1.6;margin:0 0 20px;">
            ${p.creatorName} הוסיף/ה לך משימה חדשה:
          </p>
          <table style="border-collapse:collapse;width:100%;margin:0 0 24px;border:1px solid #e0e0e0;border-radius:8px;">
            <tr><td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;font-weight:bold;color:#000;font-size:14px;width:100px;">משימה</td>
                <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#333;font-size:14px;">${p.taskTitle}</td></tr>
            ${p.clientName ? `<tr><td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;font-weight:bold;color:#000;font-size:14px;">לקוח</td>
                <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#333;font-size:14px;">${p.clientName}</td></tr>` : ""}
            ${p.taskDescription ? `<tr><td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;font-weight:bold;color:#000;font-size:14px;">תיאור</td>
                <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#333;font-size:14px;">${p.taskDescription}</td></tr>` : ""}
            <tr><td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;font-weight:bold;color:#000;font-size:14px;">תאריך יעד</td>
                <td style="padding:10px 14px;border-bottom:1px solid #e0e0e0;color:#333;font-size:14px;">${p.dueDate}</td></tr>
            <tr><td style="padding:10px 14px;font-weight:bold;color:#000;font-size:14px;">עדיפות</td>
                <td style="padding:10px 14px;color:#333;font-size:14px;">${p.priority}</td></tr>
          </table>
          <div style="text-align:center;margin:24px 0;">
            <a href="${p.taskUrl}" style="display:inline-block;background-color:#eed89b;color:#000000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
              צפייה במשימה
            </a>
          </div>
        </td></tr>
        <tr><td style="background-color:#f5f5f5;padding:16px 28px;text-align:center;">
          <p style="color:#999999;font-size:11px;margin:0;">DigiTailors Agency System</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
