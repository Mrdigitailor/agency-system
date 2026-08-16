import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { getWeeklyReportStatus, managerReminderEmail } from "@/lib/reports/ops-digest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/report-reminders — תזכורת למנהלי הקמפיינים (יום שני באמצע היום):
 * לכל מנהל קמפיינים פעיל שיש לו לקוחות שהדוח השבועי שלהם עדיין לא סומן כנשלח —
 * נשלח מייל אישי עם רשימת הלקוחות החסרים, כדי לתזכר אותו. מנהל בלי חוסרים לא מקבל מייל.
 * dryRun=1 מחזיר מי היה מקבל, בלי לשלוח.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  await prisma.cronRun.create({ data: { job: "report-reminders", detail: dryRun ? "dry" : "cron" } }).catch(() => {});

  const status = await getWeeklyReportStatus();
  const needReminder = status.byManager.filter((m) => m.missing.length > 0 && m.email);

  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, period: status.periodStr,
      recipients: needReminder.map((m) => ({ name: m.name, email: m.email, missing: m.missing.length, clients: m.missing })),
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY חסר" }, { status: 500 });
  const resend = new Resend(apiKey);

  let sent = 0;
  const errors: string[] = [];
  for (const m of needReminder) {
    try {
      const result = await resend.emails.send({
        from: "Mr.digitailor <noreply@mr-digitailor.co.il>",
        to: m.email,
        subject: `תזכורת: ${m.missing.length} דוחות שבועיים ממתינים לשליחה/סימון`,
        html: managerReminderEmail(m, status.periodStr),
      });
      if (result.error) errors.push(`${m.name}: ${result.error.message}`);
      else sent++;
    } catch (e) {
      errors.push(`${m.name}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  console.log(`[report-reminders] recipients=${needReminder.length} sent=${sent} errors=${errors.length}`);
  return NextResponse.json({ ok: true, recipients: needReminder.length, sent, errors });
}
