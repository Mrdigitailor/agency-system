import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { Resend } from "resend";
import { marked } from "marked";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

function fmt(d: string): string {
  return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function reportEmailTemplate(contentHtml: string, period: string, clientName: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#000000;padding:24px 32px;text-align:center;">
          <img src="https://agency.mr-digitailor.co.il/images/logo-mrdigitailors.svg" height="32" alt="DigiTailors" style="display:inline-block;" />
        </td></tr>
        <tr><td style="background-color:#eed89b;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 32px 12px;">
          <h1 style="color:#000;margin:0 0 4px;font-size:20px;font-weight:700;">סיכום שבועי — ${clientName}</h1>
          <p style="color:#666;font-size:14px;margin:0 0 8px;">תקופת הדיווח: ${period}</p>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <div dir="rtl" style="color:#1a1a1a;font-size:14px;line-height:1.7;">
            ${contentHtml}
          </div>
        </td></tr>
        <tr><td style="background-color:#000000;padding:18px 32px;text-align:center;">
          <p style="color:#eed89b;font-size:12px;margin:0 0 4px;font-weight:600;">DigiTailors</p>
          <p style="color:#666;font-size:11px;margin:0;">סוכנות שיווק ופרסום דיגיטלי</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * POST /api/clients/[id]/weekly-report/[reportId]/send
 * שולח את הדוח במייל ללקוח (מהדומיין המאומת, reply-to למשתמש) ומסמן כנשלח.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const user = auth as AuthUser;

  const { id: clientId, reportId } = await params;

  const report = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
  if (!report || report.clientId !== clientId) {
    return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });
  }
  if (!report.content?.trim()) {
    return NextResponse.json({ error: "אין תוכן לשליחה" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, contactEmail: true },
  });
  if (!client?.contactEmail?.trim()) {
    return NextResponse.json({ error: "ללקוח אין כתובת מייל מוגדרת (פרטי קשר)" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "שירות המייל אינו מוגדר" }, { status: 500 });
  }

  const period = `${fmt(report.weekStart)}–${fmt(report.weekEnd)}`;
  const contentHtml = await marked.parse(report.content);
  const html = reportEmailTemplate(contentHtml, period, client.name);

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: "DigiTailors <reports@mr-digitailor.co.il>",
    to: client.contactEmail,
    replyTo: user.email,
    subject: `סיכום שבועי | ${period}`,
    html,
  });

  if (result.error) {
    console.error("[WeeklyReport send] Resend error:", result.error);
    return NextResponse.json({ error: result.error.message ?? "שליחת המייל נכשלה" }, { status: 502 });
  }

  // סימון כנשלח — WeeklyReport + ReportTracker
  const today = new Date().toISOString().split("T")[0];
  await prisma.$transaction([
    prisma.weeklyReport.update({
      where: { id: reportId },
      data: { status: "sent", sentAt: new Date(), campaignManagerName: report.campaignManagerName || user.name },
    }),
    prisma.reportTracker.upsert({
      where: { clientId },
      update: { weeklyLastSent: today, weeklyContent: report.content, weeklyAuthor: user.name },
      create: {
        clientId,
        weeklyLastSent: today,
        weeklyContent: report.content,
        weeklyAuthor: user.name,
        monthlyLastSent: "",
        monthlyContent: "",
        monthlyAuthor: "",
      },
    }),
  ]);

  return NextResponse.json({ ok: true, sentTo: client.contactEmail });
}
