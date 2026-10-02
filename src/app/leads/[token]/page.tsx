"use client";

// פורטל הלידים — המוצר העצמאי שהלקוח מקבל: הלידים שלו מהצ'אט, במקום אחד.
// שחור-זהב באווירת המותג, גישה לפי קישור ייחודי. /leads/demo מציג נתוני הדגמה.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Mail, MailOpen, MousePointerClick, Calendar, FileText, ExternalLink, X, Loader2, Search } from "lucide-react";

interface Row {
  id: string; createdAt: string; name: string; email: string; phone: string;
  business: string; msgCount: number; status: string; manualStatus: string;
  declineReason: string; source: string; reportLink: string; reportStatus: string;
  meetingAt: string | null; cancelledAt: string | null;
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
  report: { link: string; headline: string; meetingAt: string | null; cancelledAt: string | null } | null;
  emails: Array<{ key: string; subject: string; sentAt: string; openedAt: string | null; clickedAt: string | null; bouncedAt: string | null }>;
}

const EMAIL_LABELS: Record<string, string> = {
  report: "מייל הדוח", nurture1: "מייל מעקב 1", nurture3: "מייל מעקב 2", nurture7: "מייל מעקב 3",
  reminder: "תזכורת יום לפני", reminder1h: "תזכורת שעה לפני", cancelled: "מייל ביטול", test: "מייל בדיקה",
};

const STATUS_CLS: Record<string, string> = {
  "שיחה": "bg-white/10 text-white/50",
  "השאיר פרטים": "bg-sky-400/15 text-sky-300",
  "קיבל דוח": "bg-brand-gold/20 text-brand-gold",
  "קבע פגישה": "bg-emerald-400/15 text-emerald-300",
  "ביטל פגישה": "bg-red-400/15 text-red-300",
  "סירב לפגישה": "bg-amber-400/15 text-amber-300",
  "חם": "bg-orange-400/20 text-orange-300",
  "נסגר": "bg-emerald-400/20 text-emerald-300",
  "חדש": "bg-sky-400/15 text-sky-300",
  "בטיפול": "bg-white/10 text-white/70",
  "לא רלוונטי": "bg-white/5 text-white/40",
};

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "";
const fmtFull = (d: string | null) => d ? new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export default function LeadsPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [demo, setDemo] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/leads/${token}?days=${days}`);
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      const d = await res.json();
      setName(d.name ?? ""); setDemo(Boolean(d.demo)); setRows(d.rows ?? []); setStats(d.stats ?? null);
    } catch { /* רענון ידני */ }
    setLoading(false);
  }, [token, days]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true); setDetail(null);
    try {
      const res = await fetch(`/api/public/leads/${token}?id=${encodeURIComponent(id)}`);
      if (res.ok) setDetail(await res.json());
    } catch { /* נסגר לבד */ }
    setDetailLoading(false);
  };

  const saveStatus = async (status: string) => {
    if (!detail) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/public/leads/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detail.id, funnelStatus: status }),
      });
      if (res.ok) { setDetail({ ...detail, funnelStatus: status }); load(); }
    } catch { /* נשאר כמו שהיה */ }
    setSavingStatus(false);
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.email, r.phone, r.business, r.source].some((v) => v.toLowerCase().includes(q));
  });

  const pct = (n: number, of: number) => of > 0 ? `${Math.round((n / of) * 100)}%` : "";

  const kpi = (label: string, value: number, sub?: string) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-brand-gold">{value.toLocaleString("he-IL")}</div>
      {sub && <div className="mt-0.5 text-[11px] text-white/40">{sub}</div>}
    </div>
  );

  if (notFound) {
    return <div className="py-24 text-center text-white/60">הקישור לא נמצא. פנו אלינו ונשלח לכם קישור חדש.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">הלידים של {name}</h1>
          <p className="mt-1 text-sm text-white/50">כל מי שדיבר עם הסוכן החכם שלך: מי הם, מאיפה הגיעו, ומה קרה בשיחה</p>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-xs text-brand-gold">מצב הדגמה</span>}
          {!demo && (
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand-gold focus:outline-none">
              <option value={7} className="bg-black">7 ימים</option>
              <option value={30} className="bg-black">30 ימים</option>
              <option value={90} className="bg-black">90 ימים</option>
              <option value={0} className="bg-black">הכל</option>
            </select>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {kpi("שיחות נפתחו", stats.sessions, `${stats.engaged} נכנסו לשיחה`)}
          {kpi("השאירו פרטים", stats.withContact, pct(stats.withContact, stats.sessions))}
          {kpi("קיבלו דוח", stats.reports, pct(stats.reports, stats.sessions))}
          {kpi("קבעו פגישה", stats.meetings, pct(stats.meetings, stats.withContact))}
          {kpi("ביטלו / סירבו", stats.cancelled + stats.declined)}
        </div>
      )}

      {stats && stats.bySource.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-2 text-sm font-medium text-white/80">מה מביא את הלידים</div>
          <div className="flex flex-wrap gap-2">
            {stats.bySource.map((s) => (
              <span key={s.source} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                {s.source} · {s.total}{s.meetings > 0 ? ` · ${s.meetings} פגישות 🎯` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון, מייל..."
          className="w-full max-w-sm rounded-lg border border-white/15 bg-white/5 py-2 pl-3 pr-9 text-sm text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-white/40">
              <th className="px-4 py-3 font-medium">תאריך</th>
              <th className="px-4 py-3 font-medium">ליד</th>
              <th className="px-4 py-3 font-medium">פרטי קשר</th>
              <th className="px-4 py-3 font-medium">הגיע מ</th>
              <th className="px-4 py-3 font-medium">מיילים</th>
              <th className="px-4 py-3 font-medium">פגישה</th>
              <th className="px-4 py-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-12 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-white/40">אין עדיין שיחות בתקופה הזאת</td></tr>}
            {!loading && filtered.map((r) => (
              <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.05]">
                <td className="whitespace-nowrap px-4 py-3 text-white/40">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{r.name || "אנונימי"}</div>
                  <div className="text-xs text-white/40">{r.business}</div>
                </td>
                <td className="px-4 py-3 text-xs text-white/50">
                  <div>{r.email}</div><div dir="ltr" className="text-right">{r.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs text-white/50">{r.source}</td>
                <td className="px-4 py-3">
                  {r.emailsSent > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                      <Mail className="h-3.5 w-3.5" /> {r.emailsSent}
                      {r.emailsOpened > 0 && <><MailOpen className="h-3.5 w-3.5 text-emerald-300" /> {r.emailsOpened}</>}
                      {r.emailsClicked > 0 && <><MousePointerClick className="h-3.5 w-3.5 text-sky-300" /> {r.emailsClicked}</>}
                    </span>
                  ) : <span className="text-xs text-white/25">-</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">
                  {r.meetingAt && !r.cancelledAt && <span className="inline-flex items-center gap-1 text-emerald-300"><Calendar className="h-3.5 w-3.5" /> {fmtFull(r.meetingAt)}</span>}
                  {r.cancelledAt && <span className="text-red-300">בוטלה</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLS[r.status] ?? "bg-brand-gold/15 text-brand-gold"}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* פאנל פירוט */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-start bg-black/70" onClick={() => setDetail(null)}>
          <div dir="rtl" className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0d0c0a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {detailLoading && <div className="flex h-40 items-center justify-center text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {detail && (
              <div className="space-y-5 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{String(detail.fields.name ?? "") || "אנונימי"}</h2>
                    <p className="text-sm text-white/50">{String(detail.fields.businessName ?? detail.fields.serviceField ?? "")}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/50">סטטוס:</span>
                  <select value={detail.funnelStatus} onChange={(e) => saveStatus(e.target.value)} disabled={savingStatus}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none">
                    <option value="" className="bg-black">אוטומטי</option>
                    {detail.statusOptions.map((s) => <option key={s} value={s} className="bg-black">{s}</option>)}
                  </select>
                  {savingStatus && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                  {[
                    ["מייל", String(detail.fields.email ?? "")],
                    ["טלפון", String(detail.fields.phone ?? "")],
                    ["תחום", String(detail.fields.serviceField ?? "")],
                    ["תקציב", detail.fields.budget ? `${Number(detail.fields.budget).toLocaleString("he-IL")} ₪` : ""],
                    ["נפתח", fmtFull(detail.createdAt)],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><span className="text-white/40">{k}: </span><span className="text-white/90">{v}</span></div>
                  ))}
                  {Boolean(detail.fields.declineReason) && (
                    <div className="col-span-2"><span className="text-white/40">סיבת סירוב: </span><span className="font-medium text-amber-300">{String(detail.fields.declineReason)}</span></div>
                  )}
                </div>

                {detail.source && Object.keys(detail.source).length > 0 && (
                  <div className="rounded-xl border border-white/10 p-4 text-sm">
                    <div className="mb-1.5 font-medium text-white/80">מאיפה הליד הגיע</div>
                    {Object.entries(detail.source).map(([k, v]) => (
                      <div key={k} className="text-xs text-white/50"><span className="font-mono text-white/35">{k}</span>: {v}</div>
                    ))}
                  </div>
                )}

                {detail.report && (
                  <div className="rounded-xl border border-white/10 p-4 text-sm">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-medium text-white/80">הדוח שקיבל</span>
                      {detail.report.link && (
                        <a href={detail.report.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-gold hover:underline">
                          לצפייה <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {detail.report.headline && <div className="text-brand-gold">{detail.report.headline}</div>}
                    {detail.report.meetingAt && !detail.report.cancelledAt && (
                      <div className="mt-1 inline-flex items-center gap-1 text-emerald-300"><Calendar className="h-4 w-4" /> פגישה: {fmtFull(detail.report.meetingAt)}</div>
                    )}
                    {detail.report.cancelledAt && <div className="mt-1 text-red-300">הפגישה בוטלה</div>}
                  </div>
                )}

                {detail.emails.length > 0 && (
                  <div className="rounded-xl border border-white/10 p-4 text-sm">
                    <div className="mb-2 font-medium text-white/80">המיילים שקיבל</div>
                    <div className="space-y-2">
                      {detail.emails.map((e, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-white/70">{EMAIL_LABELS[e.key] ?? e.key}</span>
                          <span className="flex items-center gap-2 text-white/40">
                            {fmtFull(e.sentAt)}
                            {e.bouncedAt ? <span className="text-red-300">נדחה</span>
                              : e.clickedAt ? <span className="inline-flex items-center gap-1 text-sky-300"><MousePointerClick className="h-3 w-3" /> הקליק</span>
                              : e.openedAt ? <span className="inline-flex items-center gap-1 text-emerald-300"><MailOpen className="h-3 w-3" /> נפתח</span>
                              : <span>נשלח</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80"><FileText className="h-4 w-4" /> השיחה המלאה ({detail.transcript.length} הודעות)</div>
                  <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3">
                    {detail.transcript.map((m, i) => (
                      <div key={i} className={m.role === "assistant"
                        ? "max-w-[85%] whitespace-pre-line rounded-xl rounded-tr-sm bg-white/[0.07] px-3 py-2 text-[13px] text-white/85"
                        : "mr-auto max-w-[85%] whitespace-pre-line rounded-xl rounded-tl-sm border border-brand-gold/25 bg-brand-gold/10 px-3 py-2 text-[13px] text-brand-gold"}>
                        {m.text}
                        {m.at && <div className="mt-1 text-[10px] text-white/30">{fmtFull(m.at)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
