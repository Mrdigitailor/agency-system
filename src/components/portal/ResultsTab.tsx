"use client";

// דשבורד תוצאות: הקידום הממומן במספרים, לפי טווח תאריכים שנבחר.
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  type Results, type DateRange, type RangePreset, RANGE_PRESETS, presetRange,
  portalApi, inputCls, cardCls, ils, fmtYmd, Kpi, PageTitle,
} from "./shared";

const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const AXIS_TICK = { fill: "rgba(255,255,255,0.35)", fontSize: 11 };

function DailyChart({ data, dataKey, color, gradientId, unit }: {
  data: Results["daily"]; dataKey: "spend" | "leads"; color: string; gradientId: string; unit: string;
}) {
  return (
    <div dir="ltr" className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "#141210", border: `1px solid ${color}55`, borderRadius: 10, color: "#fff" }}
            formatter={(v) => [dataKey === "spend" ? `${Number(v).toLocaleString("he-IL")} ₪` : v, unit]}
            labelFormatter={(d) => dayLabel(String(d))} />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ResultsTab({ token, demo }: { token: string; demo: boolean }) {
  // בדמו ברירת המחדל היא 30 ימים, שלא ייראה דל בתחילת חודש
  const [range, setRange] = useState<DateRange>(() => presetRange(demo ? "30" : "month"));
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!range.from || !range.to || range.from > range.to) return; // טווח מותאם שעוד לא הושלם
    setLoading(true);
    const res = await portalApi<Results>(token, { query: `view=results&from=${range.from}&to=${range.to}` });
    if (res.ok) setResults(res.data);
    setLoading(false);
  }, [token, range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  const b = results?.business;

  return (
    <>
      <PageTitle title="דשבורד תוצאות" sub="הקידום הממומן שלך במספרים: כמה יצא, כמה חזר, ומה עובד הכי טוב">
        <div className="flex flex-wrap items-center gap-2">
          <select value={range.preset} onChange={(e) => setRange((r) => presetRange(e.target.value as RangePreset, r))} className={inputCls} aria-label="טווח תאריכים">
            {RANGE_PRESETS.map((p) => <option key={p.key} value={p.key} className="bg-black">{p.label}</option>)}
          </select>
          {range.preset === "custom" && (
            <>
              <input type="date" value={range.from} max={range.to || undefined} aria-label="מתאריך"
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={`${inputCls} [color-scheme:dark]`} />
              <span className="text-sm text-white/40">עד</span>
              <input type="date" value={range.to} min={range.from || undefined} aria-label="עד תאריך"
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={`${inputCls} [color-scheme:dark]`} />
            </>
          )}
        </div>
      </PageTitle>
      <div className="-mt-3 text-xs text-white/35">מציג: {fmtYmd(range.from)} עד {fmtYmd(range.to)}</div>

      {loading && !results && <div className="py-16 text-center text-white/40"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>}

      {b && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="לידים רלוונטיים" value={b.relevantPct !== null ? `${b.relevantPct.toFixed(0)}%` : "-"} sub="מתוך מי שסומן ב-CRM" />
          <Kpi label="אחוז סגירה" value={b.closeRate !== null ? `${b.closeRate.toFixed(0)}%` : "-"} sub="עסקאות מתוך לידים שהשאירו פרטים" />
          <Kpi label="מכירות בתקופה" value={ils(b.sales)} sub="שווי העסקאות שנסגרו" />
          <Kpi label="החזר על השקעה" value={b.roi !== null ? `פי ${b.roi.toFixed(1)}` : "-"} sub="מכירות מול הוצאת פרסום" />
        </div>
      )}

      {results && !results.hasData && (
        <div className={`${cardCls} px-6 py-14 text-center`}>
          <BarChart3 className="mx-auto h-10 w-10 text-brand-gold/40" />
          <div className="mt-4 text-lg font-medium text-white/80">נתוני הקמפיין יופיעו כאן ברגע שהקמפיין שלך באוויר</div>
          <div className="mx-auto mt-2 max-w-md text-sm text-white/45">כמה הושקע, כמה לידים זה הביא, כמה עלה כל ליד, ואילו מילות חיפוש עובדות הכי טוב.</div>
        </div>
      )}

      {results?.hasData && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="תקציב שיצא" value={ils(results.totals.spend)} />
            <Kpi label="קליקים" value={results.totals.clicks.toLocaleString("he-IL")} />
            <Kpi label="עלות לקליק" value={ils(results.totals.cpc)} />
            <Kpi label="לידים מהקמפיין" value={Math.round(results.totals.leads).toLocaleString("he-IL")} />
            <Kpi label="עלות לליד" value={ils(results.totals.cpl)} />
            <Kpi label="אחוז המרה" value={`${results.totals.convRate.toFixed(1)}%`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`${cardCls} p-4`}>
              <div className="mb-3 text-sm font-medium text-white/80">השקעה יומית</div>
              <DailyChart data={results.daily} dataKey="spend" color="#eed89b" gradientId="gSpend" unit="השקעה" />
            </div>
            <div className={`${cardCls} p-4`}>
              <div className="mb-3 text-sm font-medium text-white/80">לידים ביום</div>
              <DailyChart data={results.daily} dataKey="leads" color="#34d399" gradientId="gLeads" unit="לידים" />
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
  );
}
