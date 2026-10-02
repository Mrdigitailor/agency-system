// ליד בודד במשפך — התמונה המלאה: תמליל השיחה, הדוח, המיילים והאירועים שלהם,
// מקור ההגעה והליד ב-CRM. PATCH מעדכן סטטוס ידני. אדמין ומנהלים בלבד.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  try { return JSON.parse(raw || "") as T; } catch { return fallback; }
};

const STATUS_OPTIONS = ["", "חדש", "בטיפול", "חם", "קבע פגישה", "נסגר", "לא רלוונטי"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const chat = await prisma.prospectChat.findUnique({ where: { id } });
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });

  const report = chat.reportId
    ? await prisma.potentialReport.findUnique({ where: { id: chat.reportId } })
    : null;
  const emailLogs = chat.reportId
    ? await prisma.prospectEmailLog.findMany({ where: { reportId: chat.reportId }, orderBy: { sentAt: "asc" } })
    : [];
  const lead = report?.leadId
    ? await prisma.lead.findUnique({ where: { id: report.leadId } })
    : null;

  // תמליל קריא: בלי הודעות מערכת, בלי שורת הכפתורים
  const raw = parse<Array<{ role: string; content: string; at?: string }>>(chat.messages, []);
  const transcript = raw
    .filter((m) => !(m.role === "user" && (m.content.startsWith("[מערכת]") || m.content === "__research__")))
    .map((m) => ({
      role: m.role,
      text: m.content.replace(/\[כפתורים:\s*[^\]]+\]\s*$/, "").trim(),
      at: m.at ?? "",
    }))
    .filter((m) => m.text);

  const APP_BASE = process.env.APP_BASE_URL ?? new URL(req.url).origin;

  let headline = "";
  try {
    const c = JSON.parse(report?.chain ?? "{}");
    if (c?.ok) {
      const first = c.dealValueFirst > 0;
      headline = `${Math.round(first ? c.revenueFirst.head : c.revenueFull.head).toLocaleString("he-IL")} עד ${Math.round(first ? c.revenueFirst.best : c.revenueFull.best).toLocaleString("he-IL")} ₪ בחודש`;
    }
  } catch { /* דוח בלי שרשרת */ }

  return NextResponse.json({
    id: chat.id,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    fields: parse<Record<string, unknown>>(chat.fields, {}),
    source: parse<Record<string, string>>(chat.source, {}),
    funnelStatus: chat.funnelStatus,
    statusOptions: STATUS_OPTIONS.filter(Boolean),
    transcript,
    report: report ? {
      status: report.status,
      link: `${APP_BASE}/report/${report.token}`,
      headline,
      budget: report.budget,
      meetingAt: report.meetingAt,
      bookedAt: report.bookedAt,
      cancelledAt: report.cancelledAt,
    } : null,
    emails: emailLogs.map((l) => ({
      key: l.key, subject: l.subject, sentAt: l.sentAt,
      deliveredAt: l.deliveredAt, openedAt: l.openedAt, clickedAt: l.clickedAt, bouncedAt: l.bouncedAt,
    })),
    lead: lead ? { id: lead.id, stage: lead.stage, status: lead.status, nextActionNote: lead.nextActionNote, notes: lead.notes } : null,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const funnelStatus = typeof body.funnelStatus === "string" ? body.funnelStatus.trim().slice(0, 40) : null;
  if (funnelStatus === null || !STATUS_OPTIONS.includes(funnelStatus)) {
    return NextResponse.json({ error: "סטטוס לא מוכר" }, { status: 400 });
  }

  const chat = await prisma.prospectChat.update({ where: { id }, data: { funnelStatus } }).catch(() => null);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, funnelStatus });
}
