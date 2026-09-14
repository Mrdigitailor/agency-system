// שאלון אונבורדינג — API ציבורי (מאומת ע"י token בלבד, fail-closed).
// GET — פרטי הטופס + טיוטה שמורה · PATCH — שמירת טיוטה · POST — שליחה סופית.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseAnswersV2, sanitizeAnswersV2, applyV2ToProfile } from "@/lib/onboarding/questions";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function notFound() {
  // 404 אחיד — לא חושף אם token קיים
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

async function resolveToken(token: string) {
  if (!token || !/^[a-z0-9-]{16,40}$/i.test(token)) return null;
  const q = await prisma.clientQuestionnaire.findUnique({
    where: { token },
    include: { client: { select: { id: true, name: true, deletedAt: true } } },
  });
  if (!q || q.client.deletedAt) return null;
  return q;
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await resolveToken(token);
  if (!q) return notFound();
  // נתונים שהלקוח כבר מסר בשלב המכירה — מוצגים לאישור, לא נשאלים שוב
  const lead = await prisma.lead.findFirst({
    where: { clientId: q.client.id },
    orderBy: { updatedAt: "desc" },
    select: { dealValue: true, estimatedBudget: true },
  });
  return NextResponse.json({
    clientName: q.client.name,
    status: q.status,
    answers: parseAnswersV2(q.answers),
    prefill: {
      dealValue: lead?.dealValue ? String(lead.dealValue) : "",
      budget: lead?.estimatedBudget ?? "",
    },
  });
}

// שמירת טיוטה — הלקוח יכול לחזור ולהמשיך
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await resolveToken(token);
  if (!q) return notFound();
  if (q.status === "completed") return NextResponse.json({ error: "השאלון כבר נשלח" }, { status: 409 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const answers = sanitizeAnswersV2(body);

  await prisma.clientQuestionnaire.update({ where: { id: q.id }, data: { answers: JSON.stringify(answers) } });
  return NextResponse.json({ saved: true });
}

// שליחה סופית — שומר, ממפה לתעודת הזהות, סוגר את משימת המעקב ומעדכן את הצוות
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await resolveToken(token);
  if (!q) return notFound();
  if (q.status === "completed") return NextResponse.json({ error: "השאלון כבר נשלח" }, { status: 409 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const answers = sanitizeAnswersV2(body);

  await prisma.clientQuestionnaire.update({
    where: { id: q.id },
    data: { answers: JSON.stringify(answers), status: "completed", completedAt: new Date() },
  });

  const updatedFields = await applyV2ToProfile(q.client.id, answers);

  // סגירת משימת המעקב "לוודא שהלקוח מילא שאלון" (אם קיימת)
  await prisma.task.updateMany({
    where: { clientId: q.client.id, title: "אונבורדינג: לוודא שהלקוח מילא שאלון", deletedAt: null, status: { not: "done" } },
    data: { status: "done" },
  });

  // עדכון הצוות: התראה במערכת + טלגרם לבעלים (best-effort)
  prisma.alert.create({
    data: {
      type: "questionnaire_completed",
      title: `📋 ${q.client.name} מילא/ה את שאלון האונבורדינג`,
      message: `התשובות נשמרו בתעודת הזהות (${updatedFields.length} שדות עודכנו)`,
      link: `/clients/${q.client.id}?tab=identity`,
      clientId: q.client.id,
    },
  }).catch((err) => console.error("[Questionnaire] alert failed:", err));

  const chat = ownerChatId();
  if (chat) {
    sendTelegramMessage(chat, `📋 ${q.client.name} מילא/ה את שאלון האונבורדינג!\nהתשובות נשמרו בתעודת הזהות (${updatedFields.length} שדות עודכנו) ומשימת המעקב נסגרה.`).catch(() => {});
  }

  console.log(`[Questionnaire] completed: client=${q.client.name} fieldsUpdated=${updatedFields.length}`);
  return NextResponse.json({ submitted: true });
}
