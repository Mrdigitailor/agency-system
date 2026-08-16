// לוגיקה משותפת לדיגסטים התפעוליים השבועיים:
// - משימות פתוחות שעבר זמנן (overdue)
// - סטטוס שליחת הדוחות השבועיים ללקוחות, פר מנהל קמפיינים
// משמש גם את המייל השבועי לסער (שלישי) וגם את תזכורות מנהלי הקמפיינים (שני).
import { prisma } from "@/lib/db/prisma";
import { todayIL } from "@/lib/utils/ildate";
import { getLastWeekRange, formatWeekRange } from "@/lib/utils/dates";

// ==================== משימות באיחור ====================

export interface OverdueTask {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  clientName: string | null;
  assigneeId: string | null;
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
}

/** כל המשימות הפתוחות (לא done, לא מחוקות) שעבר תאריך היעד שלהן, של עובדים פעילים */
export async function getOverdueTasks(): Promise<OverdueTask[]> {
  const today = todayIL();
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, status: { not: "done" }, dueDate: { not: "", lt: today } },
    include: {
      client: { select: { name: true } },
      assigneeUser: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  return tasks
    .filter((t) => t.assigneeUser?.isActive !== false)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      clientName: t.client?.name ?? null,
      assigneeId: t.assigneeUser?.id ?? null,
      assigneeName: t.assigneeUser?.name ?? t.assignee ?? "ללא שיוך",
      assigneeEmail: t.assigneeUser?.email ?? "",
      assigneeRole: t.assigneeUser?.role ?? "",
    }));
}

export function daysLate(dueDate: string): number {
  return Math.max(1, Math.round((new Date(todayIL()).getTime() - new Date(dueDate).getTime()) / 86400000));
}

// ==================== סטטוס דוחות שבועיים ====================

export interface ManagerReportStatus {
  id: string;
  name: string;
  email: string;
  sent: string[];    // שמות לקוחות שהדוח שלהם נשלח
  missing: string[]; // שמות לקוחות שהדוח שלהם טרם סומן כנשלח
}

export interface WeeklyReportStatus {
  periodStr: string;
  weekEndStr: string;
  total: number;             // סה"כ לקוחות פעילים
  sentCount: number;
  /** לתצוגת הבעלים — כל הלקוחות שחסר להם דוח + שם מנהל הקמפיינים */
  missing: Array<{ name: string; cm: string }>;
  /** פר מנהל קמפיינים — לתזכורות אישיות */
  byManager: ManagerReportStatus[];
}

/**
 * סטטוס שליחת הדוחות השבועיים לשבוע שחלף.
 * "נשלח" = ReportTracker.weeklyLastSent > סוף השבוע (סומן אחרי שהשבוע הסתיים).
 * שיוך מנהל קמפיינים לפי User.assignedClientIds (העובד הפעיל עם role=campaignManager).
 */
export async function getWeeklyReportStatus(): Promise<WeeklyReportStatus> {
  const { start, end } = getLastWeekRange();
  const weekEndStr = end.toISOString().split("T")[0];
  const periodStr = formatWeekRange(start, end);

  const [clients, trackers, managers] = await Promise.all([
    prisma.client.findMany({ where: { status: { not: "inactive" }, deletedAt: null }, select: { id: true, name: true } }),
    prisma.reportTracker.findMany({ select: { clientId: true, weeklyLastSent: true } }),
    prisma.user.findMany({
      where: { role: "campaignManager", isActive: true },
      select: { id: true, name: true, email: true, assignedClientIds: true },
    }),
  ]);

  const sentByClient = new Map(trackers.map((t) => [t.clientId, t.weeklyLastSent]));
  const isSent = (clientId: string) => (sentByClient.get(clientId) ?? "") > weekEndStr;
  const clientById = new Map(clients.map((c) => [c.id, c.name]));

  // מנהל הקמפיינים של כל לקוח (לתצוגת הבעלים)
  const cmByClient = new Map<string, string>();
  const byManager: ManagerReportStatus[] = [];
  for (const m of managers) {
    let assigned: string[] = [];
    try { const p = JSON.parse(m.assignedClientIds ?? "[]"); if (Array.isArray(p)) assigned = p.filter((x) => typeof x === "string"); } catch { /* ריק */ }
    const myClients = assigned.filter((id) => clientById.has(id)); // רק לקוחות פעילים
    const sent: string[] = [];
    const missing: string[] = [];
    for (const id of myClients) {
      cmByClient.set(id, m.name);
      (isSent(id) ? sent : missing).push(clientById.get(id)!);
    }
    byManager.push({ id: m.id, name: m.name, email: m.email, sent, missing });
  }

  let sentCount = 0;
  const missing: Array<{ name: string; cm: string }> = [];
  for (const c of clients) {
    if (isSent(c.id)) sentCount++;
    else missing.push({ name: c.name, cm: cmByClient.get(c.id) ?? "—" });
  }

  return { periodStr, weekEndStr, total: clients.length, sentCount, missing, byManager };
}

// ==================== רכיבי מייל משותפים ====================

const PRIORITY_HE: Record<string, string> = { urgent: "דחוף", high: "גבוהה", medium: "בינונית", low: "נמוכה" };
const APP_URL = "https://agency.mr-digitailor.co.il";

/** מעטפת מייל אחידה — כותרת שחורה עם זהב, גוף RTL */
export function wrapEmail(title: string, bodyHtml: string, footer = "נשלח אוטומטית ממערכת Mr.digitailor"): string {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;color:#111">
    <div style="background:#000;padding:18px 24px;border-radius:8px 8px 0 0">
      <p style="color:#eed89b;font-size:18px;font-weight:700;margin:0">${title}</p>
    </div>
    <div style="border:1px solid #e0e0e0;border-top:0;border-radius:0 0 8px 8px;padding:24px">
      ${bodyHtml}
      <p style="color:#999;font-size:12px;margin-top:24px">${footer}</p>
    </div>
  </div>`;
}

/** סקשן משימות באיחור, מקובץ לפי עובד — למייל הבעלים */
export function overdueTasksSection(tasks: OverdueTask[]): string {
  if (tasks.length === 0) return `<h3 style="margin:0 0 8px">📋 משימות באיחור</h3><p style="color:#16a34a">אין משימות שעבר זמנן. כל הכבוד לצוות! 🎉</p>`;
  const byAssignee = new Map<string, OverdueTask[]>();
  for (const t of tasks) { const k = t.assigneeName; (byAssignee.get(k) ?? byAssignee.set(k, []).get(k)!).push(t); }
  let html = `<h3 style="margin:0 0 8px">📋 משימות פתוחות שעבר זמנן (${tasks.length})</h3>`;
  for (const [name, list] of byAssignee) {
    const rows = list.map((t) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${t.title}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${t.clientName ?? "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${new Date(t.dueDate).toLocaleDateString("he-IL")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#ef4444;font-weight:600">${daysLate(t.dueDate)} ימים</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${PRIORITY_HE[t.priority] ?? t.priority}</td>
    </tr>`).join("");
    html += `<p style="margin:14px 0 4px;font-weight:600">👤 ${name} (${list.length})</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#f5f5f5"><th style="padding:6px 10px;text-align:right">משימה</th><th style="padding:6px 10px;text-align:right">לקוח</th><th style="padding:6px 10px;text-align:right">יעד</th><th style="padding:6px 10px;text-align:right">איחור</th><th style="padding:6px 10px;text-align:right">עדיפות</th></tr>
        ${rows}
      </table>`;
  }
  return html;
}

/** סקשן סטטוס דוחות שבועיים — למייל הבעלים */
export function reportStatusSection(status: WeeklyReportStatus): string {
  const cards = `<div style="display:flex;gap:12px;margin:8px 0 16px">
    <div style="flex:1;background:#f5f5f5;padding:12px;border-radius:8px;text-align:center"><div style="font-size:22px;font-weight:bold">${status.total}</div><div style="font-size:12px;color:#666">לקוחות פעילים</div></div>
    <div style="flex:1;background:#dcfce7;padding:12px;border-radius:8px;text-align:center"><div style="font-size:22px;font-weight:bold;color:#16a34a">${status.sentCount}</div><div style="font-size:12px;color:#666">נשלחו</div></div>
    <div style="flex:1;background:#fef2f2;padding:12px;border-radius:8px;text-align:center"><div style="font-size:22px;font-weight:bold;color:#dc2626">${status.missing.length}</div><div style="font-size:12px;color:#666">חסרים</div></div>
  </div>`;
  const missingTable = status.missing.length > 0
    ? `<h4 style="margin:0 0 6px;color:#dc2626">דוחות שטרם סומנו כנשלחו:</h4>
       <table style="width:100%;border-collapse:collapse;font-size:13px">
         <tr style="background:#f5f5f5"><th style="padding:6px 10px;text-align:right">לקוח</th><th style="padding:6px 10px;text-align:right">מנהל קמפיינים</th></tr>
         ${status.missing.map((m) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${m.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${m.cm}</td></tr>`).join("")}
       </table>`
    : `<p style="color:#16a34a">כל הדוחות השבועיים סומנו כנשלחו! 🎉</p>`;
  return `<h3 style="margin:0 0 4px">📊 סטטוס דוחות שבועיים</h3>
    <p style="color:#666;margin:0 0 4px;font-size:13px">תקופה: <strong>${status.periodStr}</strong></p>
    ${cards}${missingTable}`;
}

/** מייל תזכורת אישי למנהל קמפיינים על הדוחות שטרם סומנו כנשלחו */
export function managerReminderEmail(m: ManagerReportStatus, periodStr: string): string {
  const rows = m.missing.map((name) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${name}</td></tr>`).join("");
  const body = `<p>היי ${m.name},</p>
    <p>תזכורת ידידותית: עבור השבוע שחלף (<strong>${periodStr}</strong>) יש לקוחות שלך שהדוח השבועי שלהם <strong>עדיין לא סומן כנשלח</strong> במערכת.</p>
    <p>נא לוודא שהדוחות נשלחו ללקוחות, ולסמן אותם כ"נשלח" במערכת:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
      <tr style="background:#f5f5f5"><th style="padding:8px 12px;text-align:right">לקוח שממתין לדוח / לסימון</th></tr>
      ${rows}
    </table>
    <p style="margin-top:20px"><a href="${APP_URL}/reports" style="background:#eed89b;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">לדוחות במערכת ←</a></p>`;
  return wrapEmail("תזכורת: דוחות שבועיים", body, "נשלח אוטומטית ממערכת Mr.digitailor · יום שני");
}
