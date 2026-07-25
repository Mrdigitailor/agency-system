import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";
import { todayIL } from "@/lib/utils/ildate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * תזכורות משימות באיחור:
 * - mode=telegram (חמישי בסוף יום): דיגסט לסער בטלגרם — כל המשימות שעבר תאריך היעד שלהן, לפי עובד.
 * - mode=email (ראשון בבוקר): מייל לכל מנהל עם המשימות הפתוחות-באיחור שלו + בקשה לטפל/לעדכן את מנהל התיק.
 * - dryRun=1: מחזיר את מה שהיה נשלח, בלי לשלוח.
 */

interface OverdueTask {
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

async function getOverdueTasks(): Promise<OverdueTask[]> {
  const today = todayIL();
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "done" },
      dueDate: { not: "", lt: today },
    },
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

function daysLate(dueDate: string): number {
  return Math.max(1, Math.round((new Date(todayIL()).getTime() - new Date(dueDate).getTime()) / 86400000));
}

const PRIORITY_HE: Record<string, string> = { urgent: "דחוף", high: "גבוהה", medium: "בינונית", low: "נמוכה" };

/** דיגסט טלגרם לסער — כל המשימות באיחור, מקובצות לפי עובד */
function buildTelegramDigest(tasks: OverdueTask[]): string | null {
  if (tasks.length === 0) return null;
  const byAssignee = new Map<string, OverdueTask[]>();
  for (const t of tasks) {
    const k = t.assigneeName;
    if (!byAssignee.has(k)) byAssignee.set(k, []);
    byAssignee.get(k)!.push(t);
  }
  const parts: string[] = [`📋 סיכום סוף שבוע — ${tasks.length} משימות שעבר זמנן וטרם נסגרו:`];
  for (const [name, list] of byAssignee) {
    parts.push(`\n👤 ${name} (${list.length}):`);
    for (const t of list.slice(0, 10)) {
      parts.push(`  • ${t.title}${t.clientName ? ` — ${t.clientName}` : ""} · באיחור ${daysLate(t.dueDate)} ימ׳${t.priority === "urgent" ? " · 🚨 דחוף" : ""}`);
    }
    if (list.length > 10) parts.push(`  …ועוד ${list.length - 10}`);
  }
  return parts.join("\n");
}

/** מייל למנהל — המשימות הפתוחות שלו + בקשה לטפל */
function buildManagerEmail(name: string, tasks: OverdueTask[]): string {
  const rows = tasks
    .map(
      (t) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${t.title}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${t.clientName ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${new Date(t.dueDate).toLocaleDateString("he-IL")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;color:#ef4444;font-weight:600">${daysLate(t.dueDate)} ימים</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0">${PRIORITY_HE[t.priority] ?? t.priority}</td>
      </tr>`,
    )
    .join("");
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
    <div style="background:#000;padding:16px 24px;border-radius:8px 8px 0 0">
      <p style="color:#eed89b;font-size:18px;font-weight:700;margin:0">Mr.digitailor</p>
    </div>
    <div style="border:1px solid #e0e0e0;border-top:0;border-radius:0 0 8px 8px;padding:24px">
      <p>היי ${name},</p>
      <p>אלו המשימות שלך שעבר תאריך היעד שלהן וטרם נסגרו במערכת:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
        <tr style="background:#f5f5f5">
          <th style="padding:8px 12px;text-align:right">משימה</th>
          <th style="padding:8px 12px;text-align:right">לקוח</th>
          <th style="padding:8px 12px;text-align:right">תאריך יעד</th>
          <th style="padding:8px 12px;text-align:right">איחור</th>
          <th style="padding:8px 12px;text-align:right">עדיפות</th>
        </tr>
        ${rows}
      </table>
      <p><strong>נא לטפל במשימות בהקדם ולעדכן את הסטטוס במערכת.</strong></p>
      <p>אם יש בעיה או חסימה שמונעת סגירה של משימה — נא לעדכן את מנהל התיק בהקדם.</p>
      <p style="margin-top:20px"><a href="https://agency.mr-digitailor.co.il/tasks" style="background:#eed89b;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">למשימות שלי במערכת ←</a></p>
      <p style="color:#666;font-size:12px;margin-top:24px">נשלח אוטומטית ממערכת Mr.digitailor · יום ראשון</p>
    </div>
  </div>`;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "telegram";
  const dryRun = searchParams.get("dryRun") === "1";

  await prisma.cronRun.create({ data: { job: `overdue-${mode}`, detail: dryRun ? "dry" : "cron" } }).catch(() => {});

  const tasks = await getOverdueTasks();

  if (mode === "telegram") {
    const digest = buildTelegramDigest(tasks);
    if (dryRun) return NextResponse.json({ ok: true, dryRun: true, overdue: tasks.length, digest });
    if (!digest) {
      const chat = ownerChatId();
      if (chat) await sendTelegramMessage(chat, "📋 סיכום סוף שבוע: אין משימות באיחור — כל הכבוד לצוות! 🎉");
      return NextResponse.json({ ok: true, overdue: 0 });
    }
    const chat = ownerChatId();
    const sent = chat ? await sendTelegramMessage(chat, digest) : false;
    return NextResponse.json({ ok: true, overdue: tasks.length, sent });
  }

  if (mode === "email") {
    // קיבוץ לפי עובד — רק מנהלים/מנהלי קמפיינים פעילים עם מייל (לא אדמין, לא לקוח)
    const byAssignee = new Map<string, { name: string; email: string; tasks: OverdueTask[] }>();
    for (const t of tasks) {
      if (!t.assigneeId || !t.assigneeEmail) continue;
      if (t.assigneeRole === "admin" || t.assigneeRole === "client") continue;
      if (!byAssignee.has(t.assigneeId)) byAssignee.set(t.assigneeId, { name: t.assigneeName, email: t.assigneeEmail, tasks: [] });
      byAssignee.get(t.assigneeId)!.tasks.push(t);
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true, dryRun: true,
        recipients: [...byAssignee.values()].map((r) => ({ name: r.name, email: r.email, tasks: r.tasks.length })),
      });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    let sent = 0;
    const errors: string[] = [];
    for (const r of byAssignee.values()) {
      try {
        const result = await resend.emails.send({
          from: "Mr.digitailor <noreply@mr-digitailor.co.il>",
          to: r.email,
          subject: `⏰ ${r.tasks.length} משימות ממתינות לטיפולך — Mr.digitailor`,
          html: buildManagerEmail(r.name, r.tasks),
        });
        if (result.error) errors.push(`${r.name}: ${result.error.message}`);
        else sent++;
      } catch (e) {
        errors.push(`${r.name}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
    console.log(`[overdue-email] recipients=${byAssignee.size} sent=${sent} errors=${errors.length}`);
    return NextResponse.json({ ok: true, recipients: byAssignee.size, sent, errors });
  }

  return NextResponse.json({ error: "mode לא מוכר" }, { status: 400 });
}
