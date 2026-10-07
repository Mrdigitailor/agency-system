// קביעת פגישה ישירה מהמייל: הליד כבר השאיר פרטים, אז הכפתור במייל מוביל ישר ליומן ולא חזרה לצ'אט.
// הזיהוי לפי הקישור האישי של הדוח (אותו token שבקישור לדוח). GET = מועדים פנויים · POST = קביעה.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getFreeSlots, bookSlot } from "@/lib/prospect/scheduling";
import { notifyMeetingBooked } from "@/lib/prospect/portal-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function reportOf(token: string) {
  if (!/^[a-z0-9-]{16,40}$/i.test(token)) return null;
  return prisma.potentialReport.findUnique({ where: { token } });
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const upcoming = (r: { meetingAt: Date | null; cancelledAt: Date | null }) =>
  r.meetingAt && !r.cancelledAt && r.meetingAt.getTime() > Date.now() ? r.meetingAt : null;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const report = await reportOf((await params).token);
  if (!report || !report.contactEmail) return NextResponse.json({ error: "not found" }, { status: 404 });

  const existing = upcoming(report);
  if (existing) return NextResponse.json({ name: firstName(report.contactName), meetingAt: existing, slots: [] });
  try {
    return NextResponse.json({ name: firstName(report.contactName), meetingAt: null, slots: await getFreeSlots() });
  } catch (err) {
    console.error("[Book] slots failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "היומן לא זמין כרגע" }, { status: 503 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const report = await reportOf((await params).token);
  if (!report || !report.contactEmail) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (upcoming(report)) return NextResponse.json({ error: "כבר נקבעה פגישה" }, { status: 409 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const startIso = typeof body.startIso === "string" ? body.startIso : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/[^\d+\-\s]/g, "").trim().slice(0, 20) : "";

  // רק מועד שמופיע כרגע ברשימת המועדים הפנויים, שלא יקבעו שעה שמחוץ לשעות הפעילות
  let slots: Awaited<ReturnType<typeof getFreeSlots>>;
  try { slots = await getFreeSlots(); } catch { return NextResponse.json({ error: "היומן לא זמין כרגע" }, { status: 503 }); }
  if (!slots.some((s) => s.startIso === startIso)) return NextResponse.json({ error: "המועד כבר לא פנוי, בחרו מועד אחר" }, { status: 409 });

  const chat = await prisma.prospectChat.findFirst({ where: { reportId: report.id }, select: { id: true } });
  const business = report.businessName || report.serviceField;
  const res = await bookSlot({
    startIso, name: report.contactName || "מתעניין", email: report.contactEmail,
    phone: phone || report.contactPhone || undefined, reportId: report.id, business,
  });
  if (!res.ok || !res.meetingAt) return NextResponse.json({ error: res.error ?? "הקביעה נכשלה, נסו שוב" }, { status: 409 });

  if (phone && !report.contactPhone) await prisma.potentialReport.update({ where: { id: report.id }, data: { contactPhone: phone } }).catch(() => {});
  if (chat) {
    await notifyMeetingBooked(chat.id, { name: report.contactName, email: report.contactEmail, phone: phone || report.contactPhone, business }, res.meetingAt).catch(() => {});
  }
  return NextResponse.json({ ok: true, meetingAt: res.meetingAt });
}
