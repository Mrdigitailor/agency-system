// שאלון אונבורדינג — API ציבורי (מאומת ע"י token בלבד, fail-closed).
// GET — פרטי הטופס + טיוטה שמורה · PATCH — שמירת טיוטה · POST — שליחה סופית.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseAnswers, applyAnswersToProfile, EMPTY_ANSWERS, type QuestionnaireAnswers } from "@/lib/onboarding/questionnaire";
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

/** מסנן קלט לצורת התשובות המוכרת בלבד — מתעלם משדות זרים, קוטם אורכים */
function sanitizeAnswers(body: unknown): QuestionnaireAnswers {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 4000) => String(v ?? "").slice(0, max);
  const rows = <T>(v: unknown, map: (r: Record<string, unknown>) => T, maxRows = 20): T[] =>
    Array.isArray(v) ? v.slice(0, maxRows).map((r) => map((r ?? {}) as Record<string, unknown>)) : [];

  return {
    ...EMPTY_ANSWERS,
    businessDescription: str(b.businessDescription),
    serviceArea: ["local", "national", "international"].includes(String(b.serviceArea)) ? String(b.serviceArea) : "",
    serviceAreaDetails: str(b.serviceAreaDetails, 500),
    products: rows(b.products, (r) => ({ name: str(r.name, 200), description: str(r.description, 1000), priceRange: str(r.priceRange, 200), promotions: str(r.promotions, 500) })),
    usp: str(b.usp, 500),
    whyChooseUs: str(b.whyChooseUs),
    socialProof: str(b.socialProof),
    idealCustomer: str(b.idealCustomer),
    objections: str(b.objections),
    competitors: rows(b.competitors, (r) => ({ name: str(r.name, 200), website: str(r.website, 300) })),
    toneOfVoice: str(b.toneOfVoice, 50),
    addressStyle: str(b.addressStyle, 50),
    forbiddenWords: str(b.forbiddenWords, 1000),
    assetBankUrl: str(b.assetBankUrl, 500),
    existingAssets: str(b.existingAssets),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await resolveToken(token);
  if (!q) return notFound();
  return NextResponse.json({
    clientName: q.client.name,
    status: q.status,
    answers: parseAnswers(q.answers),
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
  const answers = sanitizeAnswers(body);

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
  const answers = sanitizeAnswers(body);

  await prisma.clientQuestionnaire.update({
    where: { id: q.id },
    data: { answers: JSON.stringify(answers), status: "completed", completedAt: new Date() },
  });

  const updatedFields = await applyAnswersToProfile(q.client.id, answers);

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
