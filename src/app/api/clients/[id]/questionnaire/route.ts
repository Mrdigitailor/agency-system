// ניהול שאלון אונבורדינג ללקוח (פנימי): יצירת קישור + שליחה במייל, ובדיקת סטטוס.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { sendQuestionnaireEmail } from "@/lib/onboarding/questionnaire-email";

export const maxDuration = 30;

function questionnaireLink(req: Request, token: string): string {
  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  return `${origin}/questionnaire/${token}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["admin", "manager", "campaignManager"]);
  if (result instanceof NextResponse) return result;
  const { id: clientId } = await params;

  const q = await prisma.clientQuestionnaire.findUnique({ where: { clientId } });
  if (!q) return NextResponse.json({ exists: false });
  return NextResponse.json({
    exists: true,
    status: q.status,
    link: questionnaireLink(req, q.token),
    sentAt: q.sentAt,
    completedAt: q.completedAt,
  });
}

// יצירת שאלון (אם אין) + שליחת המייל ללקוח
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["admin", "manager"]);
  if (result instanceof NextResponse) return result;
  const { id: clientId } = await params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, contactEmail: true, deletedAt: true },
  });
  if (!client || client.deletedAt) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  const q = await prisma.clientQuestionnaire.upsert({
    where: { clientId },
    update: {},
    create: { clientId },
  });

  const link = questionnaireLink(req, q.token);

  if (q.status === "completed") {
    return NextResponse.json({ link, status: "completed", emailSent: false, emailNote: "השאלון כבר מולא — לא נשלח מייל" });
  }

  const emailResult = await sendQuestionnaireEmail({ clientName: client.name, contactEmail: client.contactEmail, link });
  if (emailResult.sent) {
    await prisma.clientQuestionnaire.update({ where: { id: q.id }, data: { sentAt: new Date() } });
  }

  return NextResponse.json({
    link,
    status: q.status,
    emailSent: emailResult.sent,
    emailNote: emailResult.reason ?? null,
  });
}
