"use client";

// משפך הלידים — מרכז השליטה של משפך דוח הפוטנציאל:
// מספרי המשפך למעלה, רשימת כל השיחות, ולחיצה על ליד פותחת את התמונה המלאה:
// תמליל, דוח, מיילים ופתיחות, מקור הגעה, סטטוס ידני.
import { useCallback, useEffect, useState } from "react";
import { Inbox, Mail, MailOpen, Calendar, FileText, ExternalLink, X, Loader2, MousePointerClick } from "lucide-react";

interface Row {
  id: string; createdAt: string; updatedAt: string;
  name: string; email: string; phone: string; business: string; budget: number;
  msgCount: number; status: string; derivedStatus: string; manualStatus: string;
  declineReason: string; source: string;
  reportLink: string; reportStatus: string;
  meetingAt: string | null; cancelledAt: string | null; leadId: string | null;
  emailsSent: number; emailsOpened: number; emailsClicked: number;
}
interface Stats {
  sessions: number; engaged: number; withContact: number; reports: number;
  meetings: number; cancelled: number; declined: number;
  bySource: Array<{ source: string; total: number; meetings: number }>;
}
interface Detail {
  id: string; createdAt: string;
  fields: Record<string, unknown>; source: Record<string, string>;
  funnelStatus: string; statusOptions: string[];
  transcript: Array<{ role: string; text: string; at: string }>;
  report: { status: string; link: string; headline: string; budget: number; meetingAt: string | null; cancelledAt: string | null } | null;
  emails: Array<{ key: string; subject: string; sentAt: string; deliveredAt: string | null; openedAt: string | null; clickedAt: string | null; bouncedAt: string | null }>;
  lead: { id: string; stage: string; nextActionNote: string } | null;
}

const EMAIL_LABELS: Record<string, string> = {
  report: "מייל הדוח", nurture1: "חימום יום 1", nurture3: "חימום יום 3", nurture7: "חימום יום 7",
  reminder: "תזכורת יום לפני", reminder1h: "תזכורת שעה לפני", cancelled: "מייל ביטול",
};

const STATUS_CLS: Record<string, string> = {
  "שיחה": "bg-gray-100 text-gray-500",
  "השאיר פרטים": "bg-brand-info/10 text-brand-info",
  "קיבל דוח": "bg-brand-gold/20 text-[#8a6a15]",
  "קבע פגישה": "bg-brand-success/10 text-brand-success",
  "ביטל פגישה": "bg-brand-danger/10 text-brand-danger",
  "סירב לפגישה": "bg-brand-warning/10 text-brand-warning",
  "נסגר": "bg-brand-success/10 text-brand-success",
  "לא רלוונטי": "bg-gray-100 text-gray-400",
};

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "";
const fmtFull = (d: string | null) => d ? new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export default function FunnelPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/funnel?days=${days}`);
      if (res.ok) { const d = await res.json(); setRows(d.rows); setStats(d.stats); }
    } catch { /* רענון ידני */ }
    setLoading(false);
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true); setDetail(null);
    try {
      const res = await fetch(`/api/funnel/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch { /* נסגר לבד */ }
    setDetailLoading(false);
  };

  const saveStatus = async (status: string) => {
    if (!detail) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/funnel/${detail.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnelStatus: status }),
      });
      if (res.ok) { setDetail({ ...detail, funnelStatus: status }); load(); }
    } catch { /* נשאר כמו שהיה */ }
    setSavingStatus(false);
  };

  const filtered = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [r.name, r.email, r.phone, r.business, r.source].some((v) => v.toLowerCase().includes(q));
    }
    return true;
  });

  const statuses = [...new Set(rows.map((r) => r.status))];

  const kpi = (label: string, value: number, sub?: string) => (
    <div className="rounded-lg border border-brand-border bg-white p-4 shadow-sm">
      <div className="text-sm text-brand-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-brand-dark">{value.toLocaleString("he-IL")}</div>
      {sub && <div className="mt-0.5 text-xs text-brand-muted">{sub}</div>}
    </div>
  );

  const pct = (n: number, of: number) => of > 0 ? `${Math.round((n / of) * 100)}%` : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-dark"><Inbox className="h-6 w-6 text-brand-gold" /> משפך הלידים</h1>
          <p className="mt-1 text-sm text-brand-muted">כל השיחות מהצ&apos;אט הציבורי: מי הגיע, מאיפה, מה קרה בשיחה ומה הסטטוס</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
          <option value={7}>7 ימים</option>
          <option value={30}>30 ימים</option>
          <option value={90}>90 ימים</option>
          <option value={0}>הכל</option>
        </select>
      </div>

      {/* מספרי המשפך */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {kpi("שיחות נפתחו", stats.sessions, `${stats.engaged} נכנסו לשיחה`)}
          {kpi("השאירו פרטים", stats.withContact, pct(stats.withContact, stats.sessions))}
          {kpi("קיבלו דוח", stats.reports, pct(stats.reports, stats.sessions))}
          {kpi("קבעו פגישה", stats.meetings, pct(stats.meetings, stats.withContact))}
          {kpi("ביטלו / סירבו", stats.cancelled + stats.declined)}
        </div>
      )}

      {/* מקורות מובילים — יתמלא כשהקמפיינים יעלו */}
      {stats && stats.bySource.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium text-brand-dark">מקורות מובילים</div>
          <div className="flex flex-wrap gap-2">
            {stats.bySource.map((s) => (
              <span key={s.source} className="rounded-full bg-brand-light px-3 py-1 text-xs text-brand-dark">
                {s.source} · {s.total} שיחות{s.meetings > 0 ? ` · ${s.meetings} פגישות` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* סינון */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש שם, מייל, טלפון, עסק..."
          className="w-64 rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:outline-none" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
          <option value="">כל הסטטוסים</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* הרשימה */}
      <div className="overflow-x-auto rounded-lg border border-brand-border bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-light text-xs text-brand-muted">
              <th className="px-4 py-3 font-medium">תאריך</th>
              <th className="px-4 py-3 font-medium">שם / עסק</th>
              <th className="px-4 py-3 font-medium">פרטי קשר</th>
              <th className="px-4 py-3 font-medium">מקור</th>
              <th className="px-4 py-3 font-medium">מיילים</th>
              <th className="px-4 py-3 font-medium">פגישה</th>
              <th className="px-4 py-3 font-medium">סטטוס</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-brand-muted"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-brand-muted">אין שיחות בתקופה הזאת</td></tr>}
            {!loading && filtered.map((r) => (
              <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer border-b border-brand-border/60 transition-colors hover:bg-brand-light/60">
                <td className="whitespace-nowrap px-4 py-3 text-brand-muted">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-brand-dark">{r.name || "אנונימי"}</div>
                  <div className="text-xs text-brand-muted">{r.business}</div>
                </td>
                <td className="px-4 py-3 text-xs text-brand-muted">
                  <div>{r.email}</div><div dir="ltr" className="text-right">{r.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs text-brand-muted">{r.source}</td>
                <td className="px-4 py-3">
                  {r.emailsSent > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-brand-muted">
                      <Mail className="h-3.5 w-3.5" /> {r.emailsSent}
                      {r.emailsOpened > 0 && <><MailOpen className="h-3.5 w-3.5 text-brand-success" /> {r.emailsOpened}</>}
                      {r.emailsClicked > 0 && <><MousePointerClick className="h-3.5 w-3.5 text-brand-info" /> {r.emailsClicked}</>}
                    </span>
                  ) : <span className="text-xs text-brand-muted">-</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-brand-muted">
                  {r.meetingAt && !r.cancelledAt && <span className="inline-flex items-center gap-1 text-brand-success"><Calendar className="h-3.5 w-3.5" /> {fmtFull(r.meetingAt)}</span>}
                  {r.cancelledAt && <span className="text-brand-danger">בוטלה</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLS[r.status] ?? "bg-brand-gold/15 text-[#8a6a15]"}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3">
                  {r.reportLink && (
                    <a href={r.reportLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-dark">
                      <FileText className="h-3.5 w-3.5" /> דוח
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* פאנל פירוט */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-start bg-black/40" onClick={() => setDetail(null)}>
          <div dir="rtl" className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {detailLoading && <div className="flex h-40 items-center justify-center text-brand-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {detail && (
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-brand-dark">{String(detail.fields.name ?? "") || "אנונימי"}</h2>
                    <p className="text-sm text-brand-muted">{String(detail.fields.businessName ?? detail.fields.serviceField ?? "")}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-light"><X className="h-5 w-5" /></button>
                </div>

                {/* סטטוס ידני */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-brand-muted">סטטוס:</span>
                  <select value={detail.funnelStatus} onChange={(e) => saveStatus(e.target.value)} disabled={savingStatus}
                    className="rounded-lg border border-brand-border bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
                    <option value="">אוטומטי</option>
                    {detail.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {savingStatus && <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />}
                </div>

                {/* פרטים */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-brand-border bg-brand-light/50 p-4 text-sm">
                  {[
                    ["מייל", String(detail.fields.email ?? "")],
                    ["טלפון", String(detail.fields.phone ?? "")],
                    ["תחום", String(detail.fields.serviceField ?? "")],
                    ["אזור", String(detail.fields.serviceArea ?? "")],
                    ["תקציב", detail.fields.budget ? `${Number(detail.fields.budget).toLocaleString("he-IL")} ₪` : ""],
                    ["נפתח", fmtFull(detail.createdAt)],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><span className="text-brand-muted">{k}: </span><span className="text-brand-dark">{v}</span></div>
                  ))}
                  {Boolean(detail.fields.declineReason) && (
                    <div className="col-span-2"><span className="text-brand-muted">סיבת סירוב: </span><span className="font-medium text-brand-warning">{String(detail.fields.declineReason)}</span></div>
                  )}
                </div>

                {/* מקור */}
                {Object.keys(detail.source).length > 0 && (
                  <div className="rounded-lg border border-brand-border p-4 text-sm">
                    <div className="mb-1.5 font-medium text-brand-dark">מקור הגעה</div>
                    {Object.entries(detail.source).map(([k, v]) => (
                      <div key={k} className="text-xs text-brand-muted"><span className="font-mono">{k}</span>: {v}</div>
                    ))}
                  </div>
                )}

                {/* דוח ופגישה */}
                {detail.report && (
                  <div className="rounded-lg border border-brand-border p-4 text-sm">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-medium text-brand-dark">דוח פוטנציאל</span>
                      <a href={detail.report.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#8a6a15] hover:underline">
                        לצפייה <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {detail.report.headline && <div className="text-brand-dark">{detail.report.headline}</div>}
                    {detail.report.meetingAt && !detail.report.cancelledAt && (
                      <div className="mt-1 inline-flex items-center gap-1 text-brand-success"><Calendar className="h-4 w-4" /> פגישה: {fmtFull(detail.report.meetingAt)}</div>
                    )}
                    {detail.report.cancelledAt && <div className="mt-1 text-brand-danger">הפגישה בוטלה ({fmtDate(detail.report.cancelledAt)})</div>}
                  </div>
                )}

                {/* מיילים */}
                {detail.emails.length > 0 && (
                  <div className="rounded-lg border border-brand-border p-4 text-sm">
                    <div className="mb-2 font-medium text-brand-dark">מיילים שנשלחו</div>
                    <div className="space-y-2">
                      {detail.emails.map((e, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-brand-dark">{EMAIL_LABELS[e.key] ?? e.key}</span>
                          <span className="flex items-center gap-2 text-brand-muted">
                            {fmtFull(e.sentAt)}
                            {e.bouncedAt ? <span className="text-brand-danger">נדחה</span>
                              : e.clickedAt ? <span className="inline-flex items-center gap-1 text-brand-info"><MousePointerClick className="h-3 w-3" /> הקליק</span>
                              : e.openedAt ? <span className="inline-flex items-center gap-1 text-brand-success"><MailOpen className="h-3 w-3" /> נפתח</span>
                              : <span>נשלח</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* תמליל */}
                <div>
                  <div className="mb-2 text-sm font-medium text-brand-dark">תמליל השיחה ({detail.transcript.length} הודעות)</div>
                  <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-lg border border-brand-border bg-brand-light/40 p-3">
                    {detail.transcript.map((m, i) => (
                      <div key={i} className={m.role === "assistant"
                        ? "max-w-[85%] whitespace-pre-line rounded-xl rounded-tr-sm bg-white px-3 py-2 text-[13px] text-brand-dark shadow-sm"
                        : "mr-auto max-w-[85%] whitespace-pre-line rounded-xl rounded-tl-sm bg-brand-gold/25 px-3 py-2 text-[13px] text-brand-dark"}>
                        {m.text}
                        {m.at && <div className="mt-1 text-[10px] text-brand-muted">{fmtFull(m.at)}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ליד ב-CRM */}
                {detail.lead && (
                  <div className="rounded-lg border border-brand-border p-4 text-sm">
                    <div className="mb-1 font-medium text-brand-dark">ב-CRM</div>
                    <div className="text-xs text-brand-muted">שלב: {detail.lead.stage || "לידים נכנסים"}{detail.lead.nextActionNote ? ` · ${detail.lead.nextActionNote}` : ""}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
