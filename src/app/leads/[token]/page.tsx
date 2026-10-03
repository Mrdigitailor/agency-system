"use client";

// פורטל הלקוח — המוצר העצמאי: מערכת CRM מצומצמת בשחור-זהב.
// תפריט צד ימני עם שלושה מסכים: דשבורד תוצאות (קידום ממומן), CRM (לידים מהצ'אט),
// וניהול לקוחות (מי שנסגר: שלב, תשלום, הערות). /leads/demo מציג נתוני הדגמה.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Mail, MailOpen, MousePointerClick, Calendar, FileText, ExternalLink, X, Loader2, Search,
  BarChart3, Inbox, Users, Plus, UserPlus, Check,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Tab = "results" | "crm" | "customers";

interface Row {
  id: string; createdAt: string; name: string; email: string; phone: string;
  business: string; msgCount: number; status: string; manualStatus: string;
  declineReason: string; source: string; utmSource: string; utmMedium: string;
  reportLink: string; reportStatus: string;
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
interface Customer {
  id: string; name: string; business: string; email: string; phone: string;
  stage: string; paid: boolean; amountPaid: number; monthlyFee: number; notes: string; createdAt: string;
}
interface Results {
  hasData: boolean;
  totals: { spend: number; impressions: number; clicks: number; cpc: number; leads: number; cpl: number; convRate: number };
  daily: Array<{ date: string; spend: number; leads: number }>;
  campaigns: Array<{ name: string; spend: number; clicks: number; leads: number; cpl: number }>;
  terms: Array<{ term: string; clicks: number; leads: number; cpl: number }>;
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
const STAGE_CLS: Record<string, string> = {
  "חדש": "bg-sky-400/15 text-sky-300",
  "אפיון": "bg-white/10 text-white/70",
  "הקמה": "bg-amber-400/15 text-amber-300",
  "קמפיין באוויר": "bg-brand-gold/20 text-brand-gold",
  "פעיל": "bg-emerald-400/15 text-emerald-300",
  "הסתיים": "bg-white/5 text-white/40",
};

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "";
const fmtFull = (d: string | null) => d ? new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

const inputCls = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none";
const cardCls = "rounded-xl border border-white/10 bg-white/[0.04]";

export default function LeadsPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [tab, setTab] = useState<Tab>("crm");
  const [name, setName] = useState("");
  const [demo, setDemo] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // --- CRM ---
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [detailTab, setDetailTab] = useState<"chat" | "info" | "report" | "newsletter">("chat");
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  // --- לקוחות ---
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", business: "", phone: "", email: "" });

  // --- תוצאות ---
  const [results, setResults] = useState<Results | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/leads/${token}?days=${days}`);
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      const d = await res.json();
      setName(d.name ?? ""); setRows(d.rows ?? []); setStats(d.stats ?? null);
      if (d.demo) { setDemo(true); setTab((t) => (t === "crm" ? "results" : t)); }
    } catch { /* רענון ידני */ }
    setLoading(false);
  }, [token, days]);
  useEffect(() => { load(); }, [load]);

  const loadCustomers = useCallback(async () => {
    setCustLoading(true);
    try {
      const res = await fetch(`/api/public/leads/${token}?view=customers`);
      if (res.ok) { const d = await res.json(); setCustomers(d.customers ?? []); setStages(d.stages ?? []); }
    } catch { /* רענון ידני */ }
    setCustLoading(false);
  }, [token]);

  const loadResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const res = await fetch(`/api/public/leads/${token}?view=results&days=${days}`);
      if (res.ok) setResults(await res.json());
    } catch { /* רענון ידני */ }
    setResultsLoading(false);
  }, [token, days]);

  useEffect(() => { if (tab === "customers") loadCustomers(); }, [tab, loadCustomers]);
  useEffect(() => { if (tab === "results") loadResults(); }, [tab, loadResults]);

  const openDetail = async (row: Row) => {
    setDetailLoading(true); setDetail(null); setDetailRow(row); setDetailTab("chat");
    try {
      const res = await fetch(`/api/public/leads/${token}?id=${encodeURIComponent(row.id)}`);
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

  const patchCustomer = async (id: string, patch: Partial<Customer>) => {
    setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await fetch(`/api/public/leads/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "customer", id, ...patch }),
      });
    } catch { /* העדכון המקומי כבר מוצג */ }
  };

  const createCustomer = async (data: { name: string; business: string; phone: string; email: string; sourceChatId?: string }) => {
    if (!data.name.trim()) return;
    try {
      const res = await fetch(`/api/public/leads/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.customer) setCustomers((cs) => [d.customer, ...cs]);
        setShowNewCustomer(false);
        setNewCust({ name: "", business: "", phone: "", email: "" });
      }
    } catch { /* ננסה שוב */ }
  };

  const leadToCustomer = async () => {
    if (!detail) return;
    await createCustomer({
      name: String(detail.fields.name ?? "") || "ללא שם",
      business: String(detail.fields.businessName ?? detail.fields.serviceField ?? ""),
      phone: String(detail.fields.phone ?? ""),
      email: String(detail.fields.email ?? ""),
      sourceChatId: detail.id,
    });
    setDetail(null);
    setTab("customers");
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.email, r.phone, r.business, r.source].some((v) => v.toLowerCase().includes(q));
  });

  const pct = (n: number, of: number) => of > 0 ? `${Math.round((n / of) * 100)}%` : "";

  const kpi = (label: string, value: string, sub?: string) => (
    <div className={`${cardCls} p-4`}>
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-brand-gold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-white/40">{sub}</div>}
    </div>
  );

  if (notFound) {
    return <div className="py-24 text-center text-white/60">הקישור לא נמצא. פנו אלינו ונשלח לכם קישור חדש.</div>;
  }

  const NAV: Array<{ key: Tab; label: string; icon: typeof Inbox }> = [
    { key: "results", label: "דשבורד תוצאות", icon: BarChart3 },
    { key: "crm", label: "CRM · לידים", icon: Inbox },
    { key: "customers", label: "ניהול לקוחות", icon: Users },
  ];

  return (
    <div className="flex min-h-screen">
      {/* תפריט צד — ימין */}
      <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-l border-white/10 bg-black/60 lg:flex">
        <div className="px-5 pb-4 pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-7" />
          <div className="mt-3 truncate text-sm text-white/60">{name}</div>
          {demo && <span className="mt-2 inline-block rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-0.5 text-[11px] text-brand-gold">מצב הדגמה</span>}
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${tab === key ? "bg-white/10 font-medium text-brand-gold" : "text-white/60 hover:bg-white/5 hover:text-white"}`}>
              <Icon className={`h-[18px] w-[18px] ${tab === key ? "text-brand-gold" : "text-white/35"}`} />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-white/35">
          מכונת הלידים<br />מופעל ע״י Mr.digitailor
        </div>
      </aside>

      {/* תוכן */}
      <div className="min-w-0 flex-1">
        {/* ניווט מובייל */}
        <div className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-6" />
            {demo && <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-0.5 text-[10px] text-brand-gold">הדגמה</span>}
          </div>
          <div className="flex gap-1 overflow-x-auto px-2 py-2">
            {NAV.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${tab === key ? "bg-brand-gold font-medium text-black" : "text-white/60"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <main className={`mx-auto space-y-6 px-4 py-7 lg:px-8 ${tab === "crm" ? "max-w-[1500px]" : "max-w-5xl"}`}>

          {/* ===================== דשבורד תוצאות ===================== */}
          {tab === "results" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-white">דשבורד תוצאות</h1>
                  <p className="mt-1 text-sm text-white/50">הקידום הממומן שלך במספרים: כמה יצא, כמה חזר, ומה עובד הכי טוב</p>
                </div>
                {!demo && (
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls}>
                    <option value={7} className="bg-black">7 ימים</option>
                    <option value={30} className="bg-black">30 ימים</option>
                    <option value={90} className="bg-black">90 ימים</option>
                  </select>
                )}
              </div>

              {resultsLoading && <div className="py-16 text-center text-white/40"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>}

              {!resultsLoading && results && !results.hasData && (
                <div className={`${cardCls} px-6 py-14 text-center`}>
                  <BarChart3 className="mx-auto h-10 w-10 text-brand-gold/40" />
                  <div className="mt-4 text-lg font-medium text-white/80">הדשבורד יתעורר ברגע שהקמפיין שלך באוויר</div>
                  <div className="mx-auto mt-2 max-w-md text-sm text-white/45">כאן תראה בדיוק כמה הושקע, כמה לידים זה הביא, כמה עלה כל ליד, ואילו מילות חיפוש עובדות הכי טוב.</div>
                </div>
              )}

              {!resultsLoading && results?.hasData && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    {kpi("תקציב שיצא", ils(results.totals.spend))}
                    {kpi("קליקים", results.totals.clicks.toLocaleString("he-IL"))}
                    {kpi("עלות לקליק", ils(results.totals.cpc))}
                    {kpi("לידים מהקמפיין", Math.round(results.totals.leads).toLocaleString("he-IL"))}
                    {kpi("עלות לליד", ils(results.totals.cpl))}
                    {kpi("אחוז המרה", `${results.totals.convRate.toFixed(1)}%`)}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className={`${cardCls} p-4`}>
                      <div className="mb-3 text-sm font-medium text-white/80">השקעה יומית</div>
                      <div dir="ltr" className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={results.daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                            <defs><linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eed89b" stopOpacity={0.5} /><stop offset="100%" stopColor="#eed89b" stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="date" tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "#141210", border: "1px solid rgba(238,216,155,0.3)", borderRadius: 10, color: "#fff" }} formatter={(v) => [`${Number(v).toLocaleString("he-IL")} ₪`, "השקעה"]} labelFormatter={(d) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`} />
                            <Area type="monotone" dataKey="spend" stroke="#eed89b" strokeWidth={2} fill="url(#gSpend)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className={`${cardCls} p-4`}>
                      <div className="mb-3 text-sm font-medium text-white/80">לידים ביום</div>
                      <div dir="ltr" className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={results.daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                            <defs><linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.45} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="date" tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "#141210", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 10, color: "#fff" }} formatter={(v) => [v, "לידים"]} labelFormatter={(d) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`} />
                            <Area type="monotone" dataKey="leads" stroke="#34d399" strokeWidth={2} fill="url(#gLeads)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className={`${cardCls} overflow-hidden`}>
                      <div className="px-4 py-3 text-sm font-medium text-white/80">קמפיינים מובילים</div>
                      <table className="w-full text-right text-sm">
                        <thead><tr className="border-y border-white/10 text-xs text-white/40">
                          <th className="px-4 py-2 font-medium">קמפיין</th><th className="px-3 py-2 font-medium">השקעה</th><th className="px-3 py-2 font-medium">לידים</th><th className="px-3 py-2 font-medium">עלות לליד</th>
                        </tr></thead>
                        <tbody>{results.campaigns.map((c) => (
                          <tr key={c.name} className="border-b border-white/5">
                            <td className="px-4 py-2.5 text-white/85">{c.name}</td>
                            <td className="px-3 py-2.5 text-white/60">{ils(c.spend)}</td>
                            <td className="px-3 py-2.5 text-emerald-300">{c.leads}</td>
                            <td className="px-3 py-2.5 text-white/60">{c.cpl ? ils(c.cpl) : "-"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div className={`${cardCls} overflow-hidden`}>
                      <div className="px-4 py-3 text-sm font-medium text-white/80">מילות החיפוש שמביאות עבודה</div>
                      <table className="w-full text-right text-sm">
                        <thead><tr className="border-y border-white/10 text-xs text-white/40">
                          <th className="px-4 py-2 font-medium">מונח חיפוש</th><th className="px-3 py-2 font-medium">קליקים</th><th className="px-3 py-2 font-medium">לידים</th><th className="px-3 py-2 font-medium">עלות לליד</th>
                        </tr></thead>
                        <tbody>{results.terms.map((t) => (
                          <tr key={t.term} className="border-b border-white/5">
                            <td className="px-4 py-2.5 text-white/85">{t.term}</td>
                            <td className="px-3 py-2.5 text-white/60">{t.clicks}</td>
                            <td className="px-3 py-2.5 text-emerald-300">{t.leads}</td>
                            <td className="px-3 py-2.5 text-white/60">{t.cpl ? ils(t.cpl) : "-"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ===================== CRM · לידים ===================== */}
          {tab === "crm" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-white">CRM · לידים</h1>
                  <p className="mt-1 text-sm text-white/50">כל מי שדיבר עם הסוכן החכם שלך: מי הם, מאיפה הגיעו, ומה קרה בשיחה</p>
                </div>
                {!demo && (
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls}>
                    <option value={7} className="bg-black">7 ימים</option>
                    <option value={30} className="bg-black">30 ימים</option>
                    <option value={90} className="bg-black">90 ימים</option>
                    <option value={0} className="bg-black">הכל</option>
                  </select>
                )}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון, מייל..."
                  className={`${inputCls} w-full max-w-sm py-2 pl-3 pr-9`} />
              </div>

              <div className={`${cardCls} min-h-[72vh] overflow-x-auto`}>
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-white/40">
                      <th className="px-4 py-3 font-medium">תאריך</th>
                      <th className="px-4 py-3 font-medium">ליד</th>
                      <th className="px-4 py-3 font-medium">פרטי קשר</th>
                      <th className="px-4 py-3 font-medium">מקור</th>
                      <th className="px-4 py-3 font-medium">מדיום</th>
                      <th className="px-4 py-3 font-medium">מילת חיפוש</th>
                      <th className="px-4 py-3 font-medium">מיילים</th>
                      <th className="px-4 py-3 font-medium">פגישה</th>
                      <th className="px-4 py-3 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && <tr><td colSpan={9} className="px-4 py-12 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
                    {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-white/40">אין עדיין שיחות בתקופה הזאת</td></tr>}
                    {!loading && filtered.map((r) => (
                      <tr key={r.id} onClick={() => openDetail(r)} className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.05]">
                        <td className="whitespace-nowrap px-4 py-3.5 text-white/40">{fmtDate(r.createdAt)}</td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-white">{r.name || "אנונימי"}</div>
                          <div className="text-xs text-white/40">{r.business}</div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-white/50">
                          <div>{r.email}</div><div dir="ltr" className="text-right">{r.phone}</div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-white/60">{r.utmSource}</td>
                        <td className="px-4 py-3.5 text-xs text-white/60">{r.utmMedium}</td>
                        <td className="max-w-[160px] truncate px-4 py-3.5 text-xs text-white/50">{r.source !== r.utmSource ? r.source : ""}</td>
                        <td className="px-4 py-3.5">
                          {r.emailsSent > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                              <Mail className="h-3.5 w-3.5" /> {r.emailsSent}
                              {r.emailsOpened > 0 && <><MailOpen className="h-3.5 w-3.5 text-emerald-300" /> {r.emailsOpened}</>}
                              {r.emailsClicked > 0 && <><MousePointerClick className="h-3.5 w-3.5 text-sky-300" /> {r.emailsClicked}</>}
                            </span>
                          ) : <span className="text-xs text-white/25">-</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs">
                          {r.meetingAt && !r.cancelledAt && <span className="inline-flex items-center gap-1 text-emerald-300"><Calendar className="h-3.5 w-3.5" /> {fmtFull(r.meetingAt)}</span>}
                          {r.cancelledAt && <span className="text-red-300">בוטלה</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLS[r.status] ?? "bg-brand-gold/15 text-brand-gold"}`}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ===================== ניהול לקוחות ===================== */}
          {tab === "customers" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-white">ניהול לקוחות</h1>
                  <p className="mt-1 text-sm text-white/50">מי שנסגר מהמשפך: באיזה שלב הוא, מה שולם, ומה ההערות</p>
                </div>
                <button onClick={() => setShowNewCustomer((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-black transition-all hover:brightness-95">
                  <Plus className="h-4 w-4" /> לקוח חדש
                </button>
              </div>

              {showNewCustomer && (
                <div className={`${cardCls} flex flex-wrap items-end gap-3 p-4`}>
                  <div className="min-w-[160px] flex-1"><label className="mb-1 block text-xs text-white/50">שם *</label>
                    <input value={newCust.name} onChange={(e) => setNewCust((p) => ({ ...p, name: e.target.value }))} className={`${inputCls} w-full`} /></div>
                  <div className="min-w-[160px] flex-1"><label className="mb-1 block text-xs text-white/50">עסק</label>
                    <input value={newCust.business} onChange={(e) => setNewCust((p) => ({ ...p, business: e.target.value }))} className={`${inputCls} w-full`} /></div>
                  <div className="min-w-[140px]"><label className="mb-1 block text-xs text-white/50">טלפון</label>
                    <input value={newCust.phone} onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))} className={`${inputCls} w-full`} /></div>
                  <div className="min-w-[180px]"><label className="mb-1 block text-xs text-white/50">מייל</label>
                    <input value={newCust.email} onChange={(e) => setNewCust((p) => ({ ...p, email: e.target.value }))} className={`${inputCls} w-full`} /></div>
                  <button onClick={() => createCustomer(newCust)} disabled={!newCust.name.trim()}
                    className="rounded-lg bg-brand-gold px-5 py-2 text-sm font-medium text-black disabled:opacity-40">שמירה</button>
                </div>
              )}

              <div className={`${cardCls} overflow-x-auto`}>
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-white/40">
                      <th className="px-4 py-3 font-medium">לקוח</th>
                      <th className="px-4 py-3 font-medium">קשר</th>
                      <th className="px-4 py-3 font-medium">שלב בתהליך</th>
                      <th className="px-4 py-3 font-medium">תשלום</th>
                      <th className="px-4 py-3 font-medium">הערות</th>
                      <th className="px-4 py-3 font-medium">נוצר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custLoading && <tr><td colSpan={6} className="px-4 py-12 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
                    {!custLoading && customers.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-white/40">
                        עדיין אין לקוחות. אפשר להוסיף ידנית, או לפתוח ליד ב-CRM וללחוץ &quot;הפוך ללקוח&quot;.
                      </td></tr>
                    )}
                    {!custLoading && customers.map((c) => (
                      <tr key={c.id} className="border-b border-white/5 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{c.name}</div>
                          <div className="text-xs text-white/40">{c.business}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-white/50">
                          <div>{c.email}</div><div dir="ltr" className="text-right">{c.phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          <select value={c.stage} onChange={(e) => patchCustomer(c.id, { stage: e.target.value })}
                            className={`rounded-full border-0 px-3 py-1.5 text-xs font-medium focus:outline-none ${STAGE_CLS[c.stage] ?? "bg-white/10 text-white/70"}`}>
                            {stages.map((s) => <option key={s} value={s} className="bg-black text-white">{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => patchCustomer(c.id, { paid: !c.paid })}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${c.paid ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
                            {c.paid ? <><Check className="h-3.5 w-3.5" /> שילם</> : "לא שילם"}
                          </button>
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-white/50">
                            <input type="number" value={c.amountPaid || ""} placeholder="הקמה"
                              onChange={(e) => patchCustomer(c.id, { amountPaid: Number(e.target.value) || 0 })}
                              className={`${inputCls} w-20 px-2 py-1 text-xs`} />
                            <span>+</span>
                            <input type="number" value={c.monthlyFee || ""} placeholder="חודשי"
                              onChange={(e) => patchCustomer(c.id, { monthlyFee: Number(e.target.value) || 0 })}
                              className={`${inputCls} w-16 px-2 py-1 text-xs`} />
                            <span>₪</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <textarea value={c.notes} rows={2} placeholder="הערות..."
                            onChange={(e) => setCustomers((cs) => cs.map((x) => x.id === c.id ? { ...x, notes: e.target.value } : x))}
                            onBlur={(e) => patchCustomer(c.id, { notes: e.target.value })}
                            className={`${inputCls} w-44 resize-none px-2 py-1.5 text-xs`} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-white/40">{fmtDate(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>

      {/* פופאפ ליד — ארבעה טאבים */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 lg:p-8" onClick={() => setDetail(null)}>
          <div dir="rtl" className="flex h-full max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0d0c0a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {detailLoading && <div className="flex h-40 items-center justify-center text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {detail && (
              <>
                {/* כותרת */}
                <div className="flex items-start justify-between border-b border-white/10 px-5 pb-3 pt-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{String(detail.fields.name ?? "") || "אנונימי"}</h2>
                    <p className="text-sm text-white/50">{String(detail.fields.businessName ?? detail.fields.serviceField ?? "")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={leadToCustomer}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-3.5 py-1.5 text-sm font-medium text-black transition-all hover:brightness-95">
                      <UserPlus className="h-4 w-4" /> הפוך ללקוח
                    </button>
                    <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-5 w-5" /></button>
                  </div>
                </div>

                {/* טאבים */}
                <div className="flex gap-1 border-b border-white/10 px-3 pt-2">
                  {([
                    ["chat", "השיחה המלאה"],
                    ["info", "פרטי הליד"],
                    ["report", "הדוח שקיבל"],
                    ["newsletter", "ניוזלטר ומשפך"],
                  ] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setDetailTab(key)}
                      className={`rounded-t-lg px-4 py-2 text-sm transition-colors ${detailTab === key ? "border-b-2 border-brand-gold font-medium text-brand-gold" : "text-white/50 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* תוכן הטאב */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {detailTab === "chat" && (
                    <div className="space-y-2">
                      {detail.transcript.length === 0 && <div className="py-10 text-center text-white/40">אין עדיין הודעות בשיחה</div>}
                      {detail.transcript.map((m, i) => (
                        <div key={i} className={m.role === "assistant"
                          ? "max-w-[85%] whitespace-pre-line rounded-xl rounded-tr-sm bg-white/[0.07] px-3 py-2 text-[13.5px] text-white/85"
                          : "mr-auto max-w-[85%] whitespace-pre-line rounded-xl rounded-tl-sm border border-brand-gold/25 bg-brand-gold/10 px-3 py-2 text-[13.5px] text-brand-gold"}>
                          {m.text}
                          {m.at && <div className="mt-1 text-[10px] text-white/30">{fmtFull(m.at)}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === "info" && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-white/50">סטטוס:</span>
                        <select value={detail.funnelStatus} onChange={(e) => saveStatus(e.target.value)} disabled={savingStatus}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-brand-gold focus:outline-none">
                          <option value="" className="bg-black">אוטומטי</option>
                          {detail.statusOptions.map((s) => <option key={s} value={s} className="bg-black">{s}</option>)}
                        </select>
                        {savingStatus && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
                      </div>
                      <div className={`grid grid-cols-2 gap-x-4 gap-y-2.5 ${cardCls} p-4 text-sm`}>
                        {[
                          ["שם", String(detail.fields.name ?? "")],
                          ["עסק / תחום", String(detail.fields.businessName ?? detail.fields.serviceField ?? "")],
                          ["מייל", String(detail.fields.email ?? "")],
                          ["טלפון", String(detail.fields.phone ?? "")],
                          ["אזור שירות", String(detail.fields.serviceArea ?? "")],
                          ["תקציב פרסום", detail.fields.budget ? `${Number(detail.fields.budget).toLocaleString("he-IL")} ₪ לחודש` : ""],
                          ["שווי עסקה", detail.fields.dealFirst ? `${Number(detail.fields.dealFirst).toLocaleString("he-IL")} ₪` : ""],
                          ["נכנס לשיחה", fmtFull(detail.createdAt)],
                        ].filter(([, v]) => v).map(([k, v]) => (
                          <div key={k}><div className="text-xs text-white/40">{k}</div><div className="text-white/90">{v}</div></div>
                        ))}
                        {Boolean(detail.fields.declineReason) && (
                          <div className="col-span-2"><div className="text-xs text-white/40">סיבת סירוב לפגישה</div><div className="font-medium text-amber-300">{String(detail.fields.declineReason)}</div></div>
                        )}
                      </div>
                      {detail.source && Object.keys(detail.source).length > 0 && (
                        <div className="rounded-xl border border-white/10 p-4 text-sm">
                          <div className="mb-2 font-medium text-white/80">מקור ההגעה</div>
                          <div className="grid grid-cols-2 gap-y-1.5">
                            {Object.entries(detail.source).map(([k, v]) => (
                              <div key={k} className="text-xs text-white/50"><span className="font-mono text-white/35">{k}</span>: {v}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === "report" && (
                    <div className="flex h-full flex-col gap-3">
                      {!detail.report && <div className="py-10 text-center text-white/40">הליד עוד לא הגיע לשלב הדוח</div>}
                      {detail.report && (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              {detail.report.headline && <div className="text-lg font-semibold text-brand-gold">{detail.report.headline}</div>}
                              {detail.report.meetingAt && !detail.report.cancelledAt && (
                                <div className="mt-0.5 inline-flex items-center gap-1 text-sm text-emerald-300"><Calendar className="h-4 w-4" /> פגישה: {fmtFull(detail.report.meetingAt)}</div>
                              )}
                              {detail.report.cancelledAt && <div className="mt-0.5 text-sm text-red-300">הפגישה בוטלה</div>}
                            </div>
                            {detail.report.link && (
                              <a href={detail.report.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-gold/40 px-3 py-1.5 text-sm text-brand-gold hover:bg-brand-gold/10">
                                פתיחה בחלון מלא <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                          {detail.report.link
                            ? <iframe src={detail.report.link} className="min-h-0 w-full flex-1 rounded-xl border border-white/10 bg-black" title="דוח הפוטנציאל" />
                            : <div className={`${cardCls} px-6 py-10 text-center text-sm text-white/45`}>בסביבת ההדגמה הדוח המלא לא מוצג. אצל ליד אמיתי הדוח הממותג נפתח כאן.</div>}
                        </>
                      )}
                    </div>
                  )}

                  {detailTab === "newsletter" && (() => {
                    const emailOpened = detail.emails.some((e) => e.openedAt);
                    const emailClicked = detail.emails.some((e) => e.clickedAt);
                    const hasContact = Boolean(detail.fields.email || detail.fields.phone);
                    const hasReport = Boolean(detail.report);
                    const hasMeeting = Boolean(detail.report?.meetingAt && !detail.report?.cancelledAt);
                    const meetingDone = hasMeeting && new Date(String(detail.report!.meetingAt)).getTime() < Date.now();
                    const isHot = detail.funnelStatus === "חם";
                    const closed = detail.funnelStatus === "נסגר";
                    const steps = [
                      { label: "נכנס לשיחה", pctVal: 5, done: true },
                      { label: "השאיר פרטים", pctVal: 25, done: hasContact },
                      { label: "קיבל דוח", pctVal: 35, done: hasReport },
                      { label: "פתח מייל", pctVal: 45, done: emailOpened },
                      { label: "הקליק בקישור", pctVal: 55, done: emailClicked },
                      { label: "קבע פגישה", pctVal: 70, done: hasMeeting || meetingDone || closed },
                      { label: "פגישה התקיימה", pctVal: 80, done: meetingDone || closed },
                      { label: "ליד חם / הצעת מחיר", pctVal: 90, done: isHot || closed },
                      { label: "נסגר לעסקה", pctVal: 100, done: closed },
                    ];
                    const progress = Math.max(...steps.filter((s) => s.done).map((s) => s.pctVal), 0);
                    return (
                      <div className="space-y-5">
                        <div className={`${cardCls} p-4`}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium text-white/80">השלמת המשפך</span>
                            <span className="text-xl font-semibold text-brand-gold">{progress}%</span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-gradient-to-l from-[#c8a44c] to-[#eed89b] transition-all" style={{ width: `${progress}%` }} />
                          </div>
                          <div className="mt-4 grid gap-1.5 sm:grid-cols-3">
                            {steps.map((s) => (
                              <div key={s.label} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${s.done ? "bg-brand-gold/10 text-brand-gold" : "text-white/35"}`}>
                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-brand-gold text-black" : "border border-white/20"}`}>
                                  {s.done && <Check className="h-3 w-3" />}
                                </span>
                                <span className="flex-1">{s.label}</span>
                                <span className="font-mono text-[10px] opacity-70">{s.pctVal}%</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-white/10 p-4 text-sm">
                          <div className="mb-2 font-medium text-white/80">המיילים שקיבל</div>
                          {detail.emails.length === 0 && <div className="py-4 text-center text-xs text-white/40">עוד לא נשלחו מיילים לליד הזה</div>}
                          <div className="space-y-2.5">
                            {detail.emails.map((e, i) => (
                              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-white/70">{EMAIL_LABELS[e.key] ?? e.key}</span>
                                <span className="flex items-center gap-2 text-white/40">
                                  {fmtFull(e.sentAt)}
                                  {e.bouncedAt ? <span className="text-red-300">נדחה</span>
                                    : e.clickedAt ? <span className="inline-flex items-center gap-1 text-sky-300"><MousePointerClick className="h-3 w-3" /> הקליק בקישור</span>
                                    : e.openedAt ? <span className="inline-flex items-center gap-1 text-emerald-300"><MailOpen className="h-3 w-3" /> נפתח</span>
                                    : <span>נשלח</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
