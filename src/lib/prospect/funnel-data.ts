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
  declineReason: string; source: string; utmSource: string; utmMedium: string;
  utmCampaign: string; utmContent: string; relevant: string;
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

/** מקור (utm_source) עם נפילה חכמה: gclid = גוגל, אחרת דומיין מפנה, אחרת ישיר */
export function utmSourceOf(src: Record<string, string>): string {
  if (src.utm_source) return src.utm_source;
  if (src.gclid) return "google";
  if (src.referrer) { try { return new URL(src.referrer).hostname.replace(/^www\./, ""); } catch { /* לא URL */ } }
  return "ישיר";
}

/** מדיום (utm_medium): gclid = cpc, מפנה בלי utm = אורגני */
export function utmMediumOf(src: Record<string, string>): string {
  if (src.utm_medium) return src.utm_medium;
  if (src.gclid) return "cpc";
  if (src.referrer) return "אורגני";
  return "ישיר";
}

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
    utmSource: utmSourceOf(src), utmMedium: utmMediumOf(src),
    utmCampaign: src.utm_campaign ?? "", utmContent: src.utm_content ?? "", relevant: c.relevant ?? "",
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
export async function loadResults(clientId: string, from: string, to: string): Promise<ResultsData> {
  const rows = await prisma.googleAdsInsightDaily.findMany({
    where: { clientId, date: { gte: from, lte: to } },
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

  const termRows = await prisma.googleSearchTermDaily.findMany({ where: { clientId, date: { gte: from, lte: to } } });
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

// ==================== מדדי עסק לדשבורד התוצאות ====================
export interface BusinessMetrics {
  relevantPct: number | null;  // אחוז רלוונטיים מתוך מי שסומן
  closeRate: number | null;    // לקוחות שנסגרו ביחס ללידים עם פרטי קשר
  sales: number;               // שווי מכירות בתקופה (הקמות + ריטיינרים של לקוחות ששילמו)
  roi: number | null;          // החזר על השקעה בתקופה: מכירות חלקי הוצאת פרסום
}

/** חצות של יום נתון בשעון ישראל, כרגע UTC אמיתי (מטפל בשעון קיץ/חורף) */
function ilMidnight(ymd: string): Date {
  const utc = new Date(`${ymd}T00:00:00Z`);
  const il = new Date(utc.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const ref = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (il.getTime() - ref.getTime()));
}

/** מדדי עסק לטווח התאריכים שנבחר (כולל שני הקצוות, בשעון ישראל) */
export async function loadBusinessMetrics(portalId: string, clientId: string | null, from: string, to: string): Promise<BusinessMetrics> {
  const start = ilMidnight(from);
  const end = new Date(ilMidnight(to).getTime() + 24 * 3600_000);
  const inRange = { createdAt: { gte: start, lt: end } };

  const [relevantYes, relevantNo, withContactChats, customers, paidCustomers] = await Promise.all([
    prisma.prospectChat.count({ where: { relevant: "yes", ...inRange } }),
    prisma.prospectChat.count({ where: { relevant: "no", ...inRange } }),
    prisma.prospectChat.count({ where: { fields: { contains: "@" }, ...inRange } }),
    prisma.portalCustomer.count({ where: { portalId, ...inRange } }),
    prisma.portalCustomer.findMany({ where: { portalId, paid: true, ...inRange } }),
  ]);

  const sales = paidCustomers.reduce((s, c) => s + c.amountPaid + c.monthlyFee, 0);

  let roi: number | null = null;
  if (clientId && sales > 0) {
    const spendAgg = await prisma.googleAdsInsightDaily.aggregate({
      where: { clientId, date: { gte: from, lte: to } }, _sum: { spend: true },
    });
    const spend = spendAgg._sum.spend ?? 0;
    if (spend > 0) roi = sales / spend;
  }

  return {
    relevantPct: relevantYes + relevantNo > 0 ? (relevantYes / (relevantYes + relevantNo)) * 100 : null,
    closeRate: withContactChats > 0 ? (customers / withContactChats) * 100 : null,
    sales,
    roi,
  };
}
