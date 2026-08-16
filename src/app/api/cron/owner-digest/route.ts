import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import {
  getOverdueTasks, getWeeklyReportStatus,
  overdueTasksSection, reportStatusSection, wrapEmail,
} from "@/lib/reports/ops-digest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const OWNER_EMAIL = "saar@digitailors.co.il";

/**
 * GET /api/cron/owner-digest — דיגסט שבועי לבעלים (יום שלישי):
 * כל המשימות הפתוחות שעבר זמנן + סטטוס שליחת הדוחות השבועיים (למי נשלח, למי לא),
 * במייל אחד לסער. dryRun=1 מחזיר את התוכן בלי לשלוח.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  await prisma.cronRun.create({ data: { job: "owner-digest", detail: dryRun ? "dry" : "cron" } }).catch(() => {});

  const [tasks, status] = await Promise.all([getOverdueTasks(), getWeeklyReportStatus()]);

  const today = new Date().toLocaleDateString("he-IL");
  const html = wrapEmail(
    `סיכום שבועי, ${today}`,
    `${overdueTasksSection(tasks)}
     <hr style="border:0;border-top:1px solid #e0e0e0;margin:24px 0" />
     ${reportStatusSection(status)}`,
    "נשלח אוטומטית ממערכת Mr.digitailor · יום שלישי",
  );

  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true,
      overdue: tasks.length,
      reports: { total: status.total, sent: status.sentCount, missing: status.missing.length },
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY חסר" }, { status: 500 });
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: "Mr.digitailor <noreply@mr-digitailor.co.il>",
    to: OWNER_EMAIL,
    subject: `📊 סיכום שבועי, ${status.missing.length} דוחות חסרים · ${tasks.length} משימות באיחור`,
    html,
  });
  if (result.error) {
    console.error("[owner-digest]", result.error);
    return NextResponse.json({ ok: false, error: result.error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, overdue: tasks.length, missingReports: status.missing.length });
}
