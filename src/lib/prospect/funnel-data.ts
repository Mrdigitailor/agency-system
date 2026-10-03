// מנוע הנתונים של משפך הלידים — משותף לטאב הפנימי (agency) ולפורטל הלקוח העצמאי.
// בונה שורות רשימה, מספרי משפך ופירוט ליד מתוך שיחות הצ'אט, הדוחות ותיעוד המיילים.
import { prisma } from "@/lib/db/prisma";
import type { ProspectChat, PotentialReport, ProspectEmailLog, Lead } from "@/generated/prisma";

export interface ChatFieldsLite {
  name?: string; email?: string; phone?: string; serviceField?: string; serviceArea?: string;
  businessName?: string; budget?: number; declineReason?: string;
}

export interface FunnelRow {
  id: string; createdAt: Date | string; updatedAt: Date | string;
  name: string; email: string; phone: string; business: string; budget: number;
  msgCount: number; status: string; derivedStatus: string; manualStatus: string;
  declineReason: string; source: string;
  reportLink: string; reportStatus: string;
  meetingAt: Date | string | null; cancelledAt: Date | string | null; leadId: string | null;
  emailsSent: number; emailsOpened: number; emailsClicked: number;
}

export interface FunnelStats {
  sessions: number; engaged: number; withContact: number; reports: number;
  meetings: number; cancelled: number; declined: number;
  bySource: Array<{ source: string; total: number; meetings: number }>;
}

export interface FunnelDetail {
  id: string; createdAt: Date | string;
  fields: Record<string, unknown>; source: Record<string, string>;
  funnelStatus: string; statusOptions: string[];
  transcript: Array<{ role: string; text: string; at: string }>;
  report: { status: string; link: string; headline: string; budget: number; meetingAt: Date | string | null; bookedAt: Date | string | null; cancelledAt: Date | string | null } | null;
  emails: Array<{ key: string; subject: string; sentAt: Date | string; deliveredAt: Date | string | null; openedAt: Date | string | null; clickedAt: Date | string | null; bouncedAt: Date | string | null }>;
  lead: { id: string; stage: string; status: string; nextActionNote: string; notes: string } | null;
}

export const FUNNEL_STATUS_OPTIONS = ["חדש", "בטיפול", "חם", "קבע פגישה", "נסגר", "לא רלוונטי"];

const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
  try { return JSON.parse(raw || "") as T; } catch { return fallback; }
};

/** תווית מקור קריאה לבן אדם מתוך נתוני ה-utm */
export function sourceLabel(src: Record<string, string>): string {
  if (src.utm_term) return src.utm_term;
  if (src.utm_campaign) return src.utm_campaign;
  if (src.gclid) return "גוגל (קמפיין)";
  if (src.utm_source) return src.utm_source;
  if (src.referrer) { try { return new URL(src.referrer).hostname; } catch { return src.referrer; } }
  return "ישיר";
}

function derivedStatus(f: ChatFieldsLite, r?: PotentialReport | null): string {
  let derived = "שיחה";
  if (f.email || f.phone) derived = "השאיר פרטים";
  if (r?.status === "ready") derived = "קיבל דוח";
  if (f.declineReason) derived = "סירב לפגישה";
  if (r?.meetingAt && !r.cancelledAt) derived = "קבע פגישה";
  if (r?.cancelledAt) derived = "ביטל פגישה";
  return derived;
}

/** שולף ובונה את רשימת המשפך + המספרים לתקופה נתונה */
export async function loadFunnel(days: number, appBase: string): Promise<{ rows: FunnelRow[]; stats: FunnelStats }> {
  const since = days > 0 ? new Date(Date.now() - days * 24 * 3600_000) : null;
  const chats = await prisma.prospectChat.findMany({
    where: since ? { createdAt: { gte: since } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const reportIds = chats.map((c) => c.reportId).filter((x): x is string => Boolean(x));
  const reports = reportIds.length ? await prisma.potentialReport.findMany({ where: { id: { in: reportIds } } }) : [];
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const emailLogs = reportIds.length ? await prisma.prospectEmailLog.findMany({ where: { reportId: { in: reportIds } } }) : [];
  const logsByReport = new Map<string, ProspectEmailLog[]>();
  for (const log of emailLogs) {
    if (!logsByReport.has(log.reportId)) logsByReport.set(log.reportId, []);
    logsByReport.get(log.reportId)!.push(log);
  }

  const rows = chats.map((c) => buildRow(c, c.reportId ? reportById.get(c.reportId) : undefined, c.reportId ? (logsByReport.get(c.reportId) ?? []) : [], appBase));
  return { rows, stats: computeStats(rows) };
}

export function buildRow(c: ProspectChat, r: PotentialReport | undefined | null, logs: ProspectEmailLog[], appBase: string): FunnelRow {
  const f = parse<ChatFieldsLite>(c.fields, {});
  const src = parse<Record<string, string>>(c.source, {});
  const derived = derivedStatus(f, r);
  return {
    id: c.id, createdAt: c.createdAt, updatedAt: c.updatedAt,
    name: f.name ?? "", email: f.email ?? "", phone: f.phone ?? "",
    business: f.businessName || f.serviceField || "", budget: f.budget ?? 0,
    msgCount: parse<unknown[]>(c.messages, []).length,
    status: c.funnelStatus || derived, derivedStatus: derived, manualStatus: c.funnelStatus,
    declineReason: f.declineReason ?? "", source: sourceLabel(src),
    reportLink: r ? `${appBase}/report/${r.token}` : "", reportStatus: r?.status ?? "",
    meetingAt: r?.meetingAt ?? null, cancelledAt: r?.cancelledAt ?? null, leadId: r?.leadId ?? null,
    emailsSent: logs.length,
    emailsOpened: logs.filter((l) => l.openedAt).length,
    emailsClicked: logs.filter((l) => l.clickedAt).length,
  };
}

export function computeStats(rows: FunnelRow[]): FunnelStats {
  return {
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
}

/** פירוט ליד מלא: תמליל, דוח, מיילים, מקור, CRM */
export async function loadFunnelDetail(chatId: string, appBase: string): Promise<FunnelDetail | null> {
  const chat = await prisma.prospectChat.findUnique({ where: { id: chatId } });
  if (!chat) return null;
  const report = chat.reportId ? await prisma.potentialReport.findUnique({ where: { id: chat.reportId } }) : null;
  const emailLogs = chat.reportId ? await prisma.prospectEmailLog.findMany({ where: { reportId: chat.reportId }, orderBy: { sentAt: "asc" } }) : [];
  const lead = report?.leadId ? await prisma.lead.findUnique({ where: { id: report.leadId } }) : null;
  return buildDetail(chat, report, emailLogs, lead, appBase);
}

export function buildDetail(chat: ProspectChat, report: PotentialReport | null, emailLogs: ProspectEmailLog[], lead: Lead | null, appBase: string): FunnelDetail {
  const raw = parse<Array<{ role: string; content: string; at?: string }>>(chat.messages, []);
  const transcript = raw
    .filter((m) => !(m.role === "user" && (m.content.startsWith("[מערכת]") || m.content === "__research__")))
    .map((m) => ({ role: m.role, text: m.content.replace(/\[כפתורים:\s*[^\]]+\]\s*$/, "").trim(), at: m.at ?? "" }))
    .filter((m) => m.text);

  let headline = "";
  try {
    const c = JSON.parse(report?.chain ?? "{}");
    if (c?.ok) {
      const first = c.dealValueFirst > 0;
      headline = `${Math.round(first ? c.revenueFirst.head : c.revenueFull.head).toLocaleString("he-IL")} עד ${Math.round(first ? c.revenueFirst.best : c.revenueFull.best).toLocaleString("he-IL")} ₪ בחודש`;
    }
  } catch { /* דוח בלי שרשרת */ }

  return {
    id: chat.id, createdAt: chat.createdAt,
    fields: parse<Record<string, unknown>>(chat.fields, {}),
    source: parse<Record<string, string>>(chat.source, {}),
    funnelStatus: chat.funnelStatus,
    statusOptions: FUNNEL_STATUS_OPTIONS,
    transcript,
    report: report ? {
      status: report.status, link: `${appBase}/report/${report.token}`, headline,
      budget: report.budget, meetingAt: report.meetingAt, bookedAt: report.bookedAt, cancelledAt: report.cancelledAt,
    } : null,
    emails: emailLogs.map((l) => ({
      key: l.key, subject: l.subject, sentAt: l.sentAt,
      deliveredAt: l.deliveredAt, openedAt: l.openedAt, clickedAt: l.clickedAt, bouncedAt: l.bouncedAt,
    })),
    lead: lead ? { id: lead.id, stage: lead.stage, status: lead.status, nextActionNote: lead.nextActionNote, notes: lead.notes } : null,
  };
}

// ==================== לקוחות הפורטל ====================
export const CUSTOMER_STAGES = ["חדש", "אפיון", "הקמה", "קמפיין באוויר", "פעיל", "הסתיים"];

// ==================== דשבורד תוצאות (קידום ממומן) ====================
export interface ResultsData {
  hasData: boolean;
  totals: { spend: number; impressions: number; clicks: number; cpc: number; leads: number; cpl: number; convRate: number };
  daily: Array<{ date: string; spend: number; leads: number }>;
  campaigns: Array<{ name: string; spend: number; clicks: number; leads: number; cpl: number }>;
  terms: Array<{ term: string; clicks: number; leads: number; cpl: number }>;
}

/** אגרגציית תוצאות הקמפיינים של לקוח מחובר, מתוך נתוני הסנכרון היומי של גוגל אדס */
export async function loadResults(clientId: string, days: number): Promise<ResultsData> {
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString().slice(0, 10);
  const rows = await prisma.googleAdsInsightDaily.findMany({
    where: { clientId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
  if (rows.length === 0) {
    return { hasData: false, totals: { spend: 0, impressions: 0, clicks: 0, cpc: 0, leads: 0, cpl: 0, convRate: 0 }, daily: [], campaigns: [], terms: [] };
  }

  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const leads = rows.reduce((s, r) => s + r.conversions, 0);

  const byDate = new Map<string, { spend: number; leads: number }>();
  for (const r of rows) {
    const d = byDate.get(r.date) ?? { spend: 0, leads: 0 };
    d.spend += r.spend; d.leads += r.conversions;
    byDate.set(r.date, d);
  }
  const byCampaign = new Map<string, { spend: number; clicks: number; leads: number }>();
  for (const r of rows) {
    const name = r.campaignName || r.campaignId;
    const c = byCampaign.get(name) ?? { spend: 0, clicks: 0, leads: 0 };
    c.spend += r.spend; c.clicks += r.clicks; c.leads += r.conversions;
    byCampaign.set(name, c);
  }

  const termRows = await prisma.googleSearchTermDaily.findMany({ where: { clientId, date: { gte: since } } });
  const byTerm = new Map<string, { spend: number; clicks: number; leads: number }>();
  for (const r of termRows) {
    const t = byTerm.get(r.searchTerm) ?? { spend: 0, clicks: 0, leads: 0 };
    t.spend += r.spend; t.clicks += r.clicks; t.leads += r.conversions;
    byTerm.set(r.searchTerm, t);
  }

  return {
    hasData: true,
    totals: {
      spend, impressions, clicks,
      cpc: clicks > 0 ? spend / clicks : 0,
      leads, cpl: leads > 0 ? spend / leads : 0,
      convRate: clicks > 0 ? (leads / clicks) * 100 : 0,
    },
    daily: [...byDate.entries()].map(([date, v]) => ({ date, spend: Math.round(v.spend), leads: Math.round(v.leads * 10) / 10 })),
    campaigns: [...byCampaign.entries()].map(([name, v]) => ({ name, spend: Math.round(v.spend), clicks: v.clicks, leads: Math.round(v.leads * 10) / 10, cpl: v.leads > 0 ? Math.round(v.spend / v.leads) : 0 }))
      .sort((a, b) => b.spend - a.spend).slice(0, 8),
    terms: [...byTerm.entries()].map(([term, v]) => ({ term, clicks: v.clicks, leads: Math.round(v.leads * 10) / 10, cpl: v.leads > 0 ? Math.round(v.spend / v.leads) : 0 }))
      .sort((a, b) => b.leads - a.leads || b.clicks - a.clicks).slice(0, 8),
  };
}
