// תיאום פגישה ציבורי — מאומת בטוקן של דוח פוטנציאל (זה מה שהצ'אט יקרא לו).
// GET: משבצות פנויות · POST: קביעת הפגישה בפועל.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getFreeSlots, bookSlot } from "@/lib/prospect/scheduling";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function resolveReport(token: string) {
  if (!token || !/^[a-z0-9-]{16,40}$/i.test(token)) return null;
  return prisma.potentialReport.findUnique({ where: { token } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await resolveReport(token);
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const slots = await getFreeSlots();
    return NextResponse.json({ slots, booked: Boolean(report.bookedAt), meetingAt: report.meetingAt });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לטעון מועדים, נסו שוב" }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await resolveReport(token);
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (report.bookedAt) return NextResponse.json({ error: "כבר נקבעה פגישה" }, { status: 409 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const name = String(body.name ?? report.contactName ?? "").trim().slice(0, 200);
  const email = String(body.email ?? report.contactEmail ?? "").trim().toLowerCase().slice(0, 200);
  const phone = String(body.phone ?? report.contactPhone ?? "").trim().slice(0, 50);
  const startIso = String(body.startIso ?? "");
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "חסרים שם או אימייל תקין" }, { status: 400 });
  }

  // שומרים את הפרטים על הדוח — גם אם הקביעה תיכשל, הליד לא הולך לאיבוד
  await prisma.potentialReport.update({
    where: { id: report.id },
    data: { contactName: name, contactEmail: email, contactPhone: phone },
  }).catch(() => {});

  const result = await bookSlot({ startIso, name, email, phone, reportId: report.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ booked: true, meetingAt: result.meetingAt });
}
