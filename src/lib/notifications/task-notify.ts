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
    from: "Mr.digitailor <noreply@mr-digitailor.co.il>",
    to: assignee.email,
    subject: `משימה חדשה: ${taskTitle}${clientName ? ` — ${clientName}` : ""}`,
  };

  // Resend sandbox: יכול לשלוח רק לבעל החשבון.
  // אם הדומיין לא מאומת — שולח לבעלים עם ציון שם הנמען בנושא.
  // אחרי אימות דומיין ב-resend.com/domains — אפשר לשלוח לכולם.
  const OWNER_EMAIL = "saar@digitailors.co.il";
  const isDomainVerified = emailPayload.from.includes("@mr-digitailor.co.il");
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
  const priorityColors: Record<string, string> = {
    "נמוכה": "#666666",
    "בינונית": "#3b82f6",
    "גבוהה": "#f59e0b",
    "דחוף": "#ef4444",
  };
  const priorityColor = priorityColors[p.priority] ?? "#666666";

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header with logo -->
        <tr><td style="background-color:#000000;padding:28px 32px;text-align:center;">
          <img src="https://agency.mr-digitailor.co.il/images/logo-mrdigitailors.svg" height="36" alt="Mr.digitailor" style="display:inline-block;" />
        </td></tr>

        <!-- Gold accent line -->
        <tr><td style="background-color:#eed89b;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 24px;">
          <h2 style="color:#000000;margin:0 0 8px;font-size:20px;font-weight:700;">משימה חדשה</h2>
          <p style="color:#666666;font-size:15px;line-height:1.6;margin:0 0 24px;">
            שלום ${p.assigneeName}, ${p.creatorName} שייך/ה אליך משימה חדשה.
          </p>

          <!-- Task card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;margin:0 0 24px;">
            <!-- Task title row -->
            <tr><td style="padding:16px 20px;background-color:#000000;">
              <p style="color:#eed89b;font-size:16px;font-weight:700;margin:0;">${p.taskTitle}</p>
            </td></tr>

            <!-- Details -->
            ${p.clientName ? `
            <tr><td style="padding:14px 20px;border-bottom:1px solid #eeeeee;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="28" style="vertical-align:top;padding-left:10px;">
                  <span style="font-size:16px;">👤</span>
                </td>
                <td>
                  <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">לקוח</p>
                  <p style="color:#000000;font-size:14px;font-weight:600;margin:0;">${p.clientName}</p>
                </td>
              </tr></table>
            </td></tr>` : ""}

            ${p.taskDescription ? `
            <tr><td style="padding:14px 20px;border-bottom:1px solid #eeeeee;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="28" style="vertical-align:top;padding-left:10px;">
                  <span style="font-size:16px;">📝</span>
                </td>
                <td>
                  <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">תיאור</p>
                  <p style="color:#333333;font-size:14px;line-height:1.5;margin:0;">${p.taskDescription}</p>
                </td>
              </tr></table>
            </td></tr>` : ""}

            <tr><td style="padding:14px 20px;border-bottom:1px solid #eeeeee;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="28" style="vertical-align:top;padding-left:10px;">
                  <span style="font-size:16px;">📅</span>
                </td>
                <td>
                  <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">תאריך יעד</p>
                  <p style="color:#000000;font-size:14px;font-weight:600;margin:0;">${p.dueDate}</p>
                </td>
              </tr></table>
            </td></tr>

            <tr><td style="padding:14px 20px;border-bottom:1px solid #eeeeee;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="28" style="vertical-align:top;padding-left:10px;">
                  <span style="font-size:16px;">⚡</span>
                </td>
                <td>
                  <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">עדיפות</p>
                  <p style="font-size:14px;font-weight:700;margin:0;color:${priorityColor};">${p.priority}</p>
                </td>
              </tr></table>
            </td></tr>

            <tr><td style="padding:14px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td width="28" style="vertical-align:top;padding-left:10px;">
                  <span style="font-size:16px;">👨‍💼</span>
                </td>
                <td>
                  <p style="color:#999999;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">שויך על ידי</p>
                  <p style="color:#000000;font-size:14px;font-weight:600;margin:0;">${p.creatorName}</p>
                </td>
              </tr></table>
            </td></tr>
          </table>

          <!-- CTA button -->
          <div style="text-align:center;margin:0 0 8px;">
            <a href="${p.taskUrl}" style="display:inline-block;background-color:#eed89b;color:#000000;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;">
              צפייה במשימה
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#000000;padding:20px 32px;text-align:center;">
          <p style="color:#eed89b;font-size:12px;margin:0 0 4px;font-weight:600;">Mr.digitailor</p>
          <p style="color:#666666;font-size:11px;margin:0;">מערכת ניהול סוכנות פרסום דיגיטלי</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
