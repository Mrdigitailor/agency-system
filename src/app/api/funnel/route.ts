// משפך הלידים — רשימת כל השיחות מהצ'אט הציבורי עם התמונה המלאה של כל ליד:
// פרטים, דוח, פגישה, מיילים ופתיחות, מקור הגעה וסטטוס. אדמין ומנהלים בלבד.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

interface ChatFieldsLite {
  name?: string; email?: string; phone?: string; serviceField?: string;
  businessName?: string; budget?: number; declineReason?: string;
}

const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  try { return JSON.parse(raw || "") as T; } catch { return fallback; }
};

/** תווית מקור קריאה לבן אדם מתוך נתוני ה-utm */
function sourceLabel(src: Record<string, string>): string {
  if (src.utm_term) return src.utm_term;
  if (src.utm_campaign) return src.utm_campaign;
  if (src.gclid) return "גוגל (קמפיין)";
  if (src.utm_source) return src.utm_source;
  if (src.referrer) { try { return new URL(src.referrer).hostname; } catch { return src.referrer; } }
  return "ישיר";
}

export async function GET(req: Request) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  const days = Number(new URL(req.url).searchParams.get("days")) || 0;
  const since = days > 0 ? new Date(Date.now() - days * 24 * 3600_000) : null;

  const chats = await prisma.prospectChat.findMany({
    where: since ? { createdAt: { gte: since } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const reportIds = chats.map((c) => c.reportId).filter((x): x is string => Boolean(x));
  const reports = reportIds.length
    ? await prisma.potentialReport.findMany({ where: { id: { in: reportIds } } })
    : [];
  const reportById = new Map(reports.map((r) => [r.id, r]));

  const emailLogs = reportIds.length
    ? await prisma.prospectEmailLog.findMany({ where: { reportId: { in: reportIds } } })
    : [];
  const logsByReport = new Map<string, typeof emailLogs>();
  for (const log of emailLogs) {
    if (!logsByReport.has(log.reportId)) logsByReport.set(log.reportId, []);
    logsByReport.get(log.reportId)!.push(log);
  }

  const APP_BASE = process.env.APP_BASE_URL ?? new URL(req.url).origin;

  const rows = chats.map((c) => {
    const f = parse<ChatFieldsLite>(c.fields, {});
    const src = parse<Record<string, string>>(c.source, {});
    const r = c.reportId ? reportById.get(c.reportId) : undefined;
    const logs = c.reportId ? (logsByReport.get(c.reportId) ?? []) : [];
    const msgCount = parse<unknown[]>(c.messages, []).length;

    // סטטוס נגזר — אלא אם סער קבע ידנית
    let derived = "שיחה";
    if (f.email || f.phone) derived = "השאיר פרטים";
    if (r?.status === "ready") derived = "קיבל דוח";
    if (f.declineReason) derived = "סירב לפגישה";
    if (r?.meetingAt && !r.cancelledAt) derived = "קבע פגישה";
    if (r?.cancelledAt) derived = "ביטל פגישה";

    return {
      id: c.id,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      name: f.name ?? "",
      email: f.email ?? "",
      phone: f.phone ?? "",
      business: f.businessName || f.serviceField || "",
      budget: f.budget ?? 0,
      msgCount,
      status: c.funnelStatus || derived,
      derivedStatus: derived,
      manualStatus: c.funnelStatus,
      declineReason: f.declineReason ?? "",
      source: sourceLabel(src),
      reportLink: r ? `${APP_BASE}/report/${r.token}` : "",
      reportStatus: r?.status ?? "",
      meetingAt: r?.meetingAt ?? null,
      cancelledAt: r?.cancelledAt ?? null,
      leadId: r?.leadId ?? null,
      emailsSent: logs.length,
      emailsOpened: logs.filter((l) => l.openedAt).length,
      emailsClicked: logs.filter((l) => l.clickedAt).length,
    };
  });

  // מספרי המשפך על אותה תקופה
  const stats = {
    sessions: rows.length,
    engaged: rows.filter((x) => x.msgCount > 2).length,
    withContact: rows.filter((x) => x.email || x.phone).length,
    reports: rows.filter((x) => x.reportStatus === "ready").length,
    meetings: rows.filter((x) => x.meetingAt && !x.cancelledAt).length,
    cancelled: rows.filter((x) => x.cancelledAt).length,
    declined: rows.filter((x) => x.declineReason).length,
    bySource: Object.entries(
      rows.reduce<Record<string, { total: number; meetings: number }>>((acc, x) => {
        acc[x.source] = acc[x.source] ?? { total: 0, meetings: 0 };
        acc[x.source].total++;
        if (x.meetingAt && !x.cancelledAt) acc[x.source].meetings++;
        return acc;
      }, {}),
    ).map(([source, v]) => ({ source, ...v })).sort((a, b) => b.total - a.total).slice(0, 10),
  };

  return NextResponse.json({ rows, stats });
}
