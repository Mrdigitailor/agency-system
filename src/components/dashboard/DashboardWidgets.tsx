"use client";

import { ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { getCurrencySymbol } from "@/lib/utils/currency";
import { PlatformLogos, PLATFORM_DISPLAY_NAMES } from "@/components/dashboard/PlatformLogo";

// ----- טיפוסי נתונים (תואמים ל-engine WidgetData) -----
interface KpiResult { type: "kpi"; metrics: { id: string; label: string; value: number; unit: string; change?: number | null }[] }
interface SeriesResult { type: "series"; display: "line" | "area" | "bar"; buckets: string[]; series: { id: string; label: string; values: number[] }[] }
interface TableResult { type: "table"; columns: { id: string; label: string }[]; rows: (string | number)[][] }
interface PieResult { type: "pie"; metricId: string; label: string; slices: { label: string; value: number }[] }
interface TextResult { type: "text"; heading: boolean; body: string }
interface EmptyResult { type: "empty"; reason: string }
export type WidgetData = KpiResult | SeriesResult | TableResult | PieResult | TextResult | EmptyResult;

const LOWER_BETTER = new Set(["cpa", "cpc", "cpm", "cpl", "cplc"]);
function Delta({ id, change, dark }: { id: string; change?: number | null; dark?: boolean }) {
  if (change === null || change === undefined) return null;
  const good = LOWER_BETTER.has(id) ? change < 0 : change > 0;
  const cls = dark
    ? (change === 0 ? "bg-white/5 text-white/40" : good ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")
    : (change === 0 ? "bg-brand-bg text-brand-muted" : good ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600");
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${cls}`} title="לעומת התקופה הקודמת">
      {arrow} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

/** מצב ריק ידידותי — במקום כרטיס לבן ריק שנראה כמו תקלה */
function NoData({ note, dark }: { note?: string; dark?: boolean }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 py-6 text-center">
      <svg className={`h-6 w-6 ${dark ? "text-white/20" : "text-brand-muted/40"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5V19a1.5 1.5 0 001.5 1.5h15A1.5 1.5 0 0021 19v-5.5M3 13.5L9 7l4 4 8-8M3 13.5h18" />
      </svg>
      <p className={`text-xs ${dark ? "text-white/40" : "text-brand-muted"}`}>{note ?? "אין נתונים בטווח שנבחר"}</p>
    </div>
  );
}

/** האם לסדרת נתונים יש בכלל ערכים להצגה */
const seriesHasData = (d: SeriesResult) => d.buckets.length > 0 && d.series.some((s) => s.values.some((v) => v !== 0));

export interface WidgetDTO { id: string; title: string; displayType: string; size: string; platforms?: string[]; data: WidgetData }

const PIE_COLORS = ["#eed89b", "#000000", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
// בכהה — בלי שחור (נבלע ברקע), פלטת ניאון-רכה
const PIE_COLORS_DARK = ["#eed89b", "#7dd3fc", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf", "#f472b6"];
const fmtNum = (n: number) => Math.round(n).toLocaleString("he-IL");

function formatByUnit(value: number, unit: string, currency: string): string {
  switch (unit) {
    case "currency": return `${getCurrencySymbol(currency)}${fmtNum(value)}`;
    case "percent": return `${value.toFixed(2)}%`;
    case "ratio": return value.toFixed(2);
    default: return fmtNum(value);
  }
}
const fmtDate = (d: string) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
};

function KpiView({ data, currency, dark }: { data: KpiResult; currency: string; dark?: boolean }) {
  const n = data.metrics.length;
  // כל מדד תחום במסגרת משלו, ממורכז — מראה של רשת אריחים טכנולוגית
  const tile = dark
    ? "flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-4 text-center transition-colors hover:border-brand-gold/40"
    : "flex flex-col items-center gap-1.5 rounded-xl border border-brand-border bg-white px-3 py-4 text-center transition-colors hover:border-brand-gold/50";
  const labelCls = dark ? "text-[11px] text-white/45" : "text-[11px] text-brand-muted";
  const numCls = dark ? "text-2xl font-semibold tabular-nums tracking-tight text-white" : "text-2xl font-semibold tabular-nums tracking-tight text-brand-dark";

  if (n === 1) {
    const m = data.metrics[0];
    return (
      <div className="mt-3">
        <div className={tile}>
          <p className={labelCls}>{m.label}</p>
          <p className={dark ? "text-3xl font-semibold tabular-nums tracking-tight text-white" : "text-3xl font-semibold tabular-nums tracking-tight text-brand-dark"}>{formatByUnit(m.value, m.unit, currency)}</p>
          <Delta id={m.id} change={m.change} dark={dark} />
        </div>
      </div>
    );
  }
  const cols = n <= 2 ? "grid-cols-2" : n === 3 ? "grid-cols-2 sm:grid-cols-3" : n === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  return (
    <div className={`mt-3 grid gap-3 ${cols}`}>
      {data.metrics.map((m) => (
        <div key={m.id} className={tile}>
          <p className={labelCls}>{m.label}</p>
          <p className={numCls}>{formatByUnit(m.value, m.unit, currency)}</p>
          <Delta id={m.id} change={m.change} dark={dark} />
        </div>
      ))}
    </div>
  );
}

function SeriesView({ data, dark, accent = "#eed89b" }: { data: SeriesResult; dark?: boolean; accent?: string }) {
  if (!seriesHasData(data)) return <NoData dark={dark} />;
  const chartData = data.buckets.map((b, i) => {
    const row: Record<string, string | number> = { bucket: b };
    for (const s of data.series) row[s.id] = s.values[i] ?? 0;
    return row;
  });
  const grid = dark ? "rgba(255,255,255,0.08)" : "#e0e0e0";
  const axis = dark ? "#8a8a8a" : "#666";
  const tip = dark
    ? { borderRadius: 10, border: "1px solid #2a2a2a", background: "#161616", color: "#fff", fontSize: 12 }
    : { borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 12 };
  // צבע ראשי = accent המותג; בבהיר קו כהה (accent בהיר נעלם על לבן). עמודות תמיד accent.
  const colors = data.display === "bar"
    ? [accent, "#7dd3fc", "#34d399"]
    : dark ? [accent, "#7dd3fc", "#fbbf24"] : ["#111111", "#3b82f6", "#f59e0b"];
  if (data.display === "bar") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: axis }} />
          <YAxis tick={{ fontSize: 11, fill: axis }} width={44} />
          <Tooltip labelFormatter={(l) => fmtDate(String(l))} contentStyle={tip} cursor={{ fill: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }} />
          {data.series.map((s, i) => <Bar key={s.id} dataKey={s.id} name={s.label} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  const Chart = data.display === "area" ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <Chart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
        <defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity={dark ? 0.35 : 0.5} /><stop offset="100%" stopColor={accent} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: axis }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: axis }} width={44} />
        <Tooltip labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => fmtNum(Number(v))} contentStyle={tip} cursor={{ stroke: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)" }} />
        {data.series.map((s, i) =>
          data.display === "area"
            ? <Area key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={colors[i % colors.length]} strokeWidth={2} fill={i === 0 ? "url(#wgrad)" : "transparent"} />
            : <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

function PieView({ data, dark, palette: customPalette }: { data: PieResult; dark?: boolean; palette?: string[] }) {
  const total = data.slices.reduce((s, x) => s + x.value, 0);
  if (data.slices.length === 0 || total === 0) return <NoData dark={dark} />;
  const palette = customPalette && customPalette.length > 0 ? customPalette : (dark ? PIE_COLORS_DARK : PIE_COLORS);
  const tip = dark
    ? { borderRadius: 10, border: "1px solid #2a2a2a", background: "#161616", color: "#fff", fontSize: 12 }
    : { borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 12 };
  // דונאט + מקרא עם אחוזים — קריא יותר מתוויות על הפרוסות (במיוחד במובייל)
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
      <div className="h-[190px] w-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* paddingAngle עם פרוסה אחת שובר את הציור ב-recharts — רק כשיש כמה פרוסות */}
            <Pie data={data.slices} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={data.slices.length > 1 ? 2 : 0} strokeWidth={0} isAnimationActive={false}>
              {data.slices.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => fmtNum(Number(v))} contentStyle={tip} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 sm:w-auto">
        {data.slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[i % palette.length] }} />
            <span className={dark ? "text-white/85" : "text-brand-dark"}>{s.label}</span>
            <span className={dark ? "tabular-nums text-white/45" : "tabular-nums text-brand-muted"}>· {fmtNum(s.value)} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableView({ data, dark }: { data: TableResult; dark?: boolean }) {
  if (data.rows.length === 0) return <NoData dark={dark} />;
  const headBg = dark ? "bg-[#161616]" : "bg-brand-light";
  const headRow = dark ? "border-b border-white/10 text-white/50" : "border-b border-brand-border text-brand-muted";
  const bodyRow = dark ? "border-b border-white/5 odd:bg-white/[0.02]" : "border-b border-brand-border/40 odd:bg-brand-bg/40";
  return (
    <div className="mt-2 max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <thead className={`sticky top-0 ${headBg}`}>
          <tr className={headRow}>
            {/* עמודה ראשונה (שם) לימין; מספרים ממורכזים */}
            {data.columns.map((c, j) => <th key={c.id} className={`px-2 py-2 font-medium ${j === 0 ? "text-right" : "text-center"}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className={bodyRow}>
              {row.map((cell, j) => (
                <td key={j} className={`px-2 py-2 tabular-nums ${j === 0 ? "text-right font-medium" : "text-center"} ${dark ? (j === 0 ? "text-white" : "text-white/85") : "text-brand-dark"}`}>
                  {typeof cell === "number" ? fmtNum(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WidgetRenderer({ widget, currency, dark, accent = "#eed89b", palette }: { widget: WidgetDTO; currency: string; dark?: boolean; accent?: string; palette?: string[] }) {
  const { data } = widget;
  const platforms = widget.platforms ?? [];

  // כותרת פלטפורמה — לוגו גדול + שם הפלטפורמה
  if (widget.displayType === "platform_header") {
    const names = platforms.map((p) => PLATFORM_DISPLAY_NAMES[p] ?? p).join(" + ");
    return (
      <div className="flex items-center gap-3 border-b-2 pb-3 pt-4" style={{ borderColor: accent }}>
        <PlatformLogos platforms={platforms} className="h-8 w-8" />
        <h2 className={`text-xl font-bold ${dark ? "text-white" : "text-brand-dark"}`}>{widget.title || names}</h2>
      </div>
    );
  }

  // כותרת / מפריד — בלי תיבת כרטיס
  if (data.type === "text" && data.heading) {
    return <div className="border-b-2 pb-2 pt-4" style={{ borderColor: accent }}><h2 className={`text-xl font-bold ${dark ? "text-white" : "text-brand-dark"}`}>{widget.title}</h2></div>;
  }
  if (data.type === "text") {
    return (
      <div className={cardCls(dark)}>
        {widget.title && <p className={`mb-1 text-sm font-semibold ${dark ? "text-white" : "text-brand-dark"}`}>{widget.title}</p>}
        <p className={`whitespace-pre-wrap text-sm leading-relaxed ${dark ? "text-white/80" : "text-brand-dark"}`}>{data.body}</p>
      </div>
    );
  }

  return (
    <div className={cardCls(dark)}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-semibold ${dark ? "text-white/90" : "text-brand-dark"}`}>{widget.title || " "}</p>
        <PlatformLogos platforms={platforms} />
      </div>
      {data.type === "empty" ? (
        <NoData note={data.reason} dark={dark} />
      ) : data.type === "kpi" ? (
        <KpiView data={data} currency={currency} dark={dark} />
      ) : data.type === "series" ? (
        <div className="mt-3"><SeriesView data={data} dark={dark} accent={accent} /></div>
      ) : data.type === "pie" ? (
        <div className="mt-3"><PieView data={data} dark={dark} palette={palette} /></div>
      ) : (
        <TableView data={data} dark={dark} />
      )}
    </div>
  );
}

// מעטפת הכרטיס — כהה (זכוכית עם גבול זהוב-עדין) או בהיר
function cardCls(dark?: boolean): string {
  return dark
    ? "rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_0_0_1px_rgba(238,216,155,0.04)] backdrop-blur-sm transition-colors hover:border-brand-gold/25"
    : "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";
}

const SPAN: Record<string, string> = { full: "md:col-span-12", half: "md:col-span-6", third: "md:col-span-4" };

export function WidgetGrid({ widgets, currency, dark, accent, palette }: { widgets: WidgetDTO[]; currency: string; dark?: boolean; accent?: string; palette?: string[] }) {
  if (widgets.length === 0) {
    return <p className={`py-12 text-center text-sm ${dark ? "text-white/40" : "text-brand-muted"}`}>אין ווידג&apos;טים בדשבורד עדיין.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      {widgets.map((w) => (
        // id לעוגן ניווט (scroll-mt כדי שהכותרת לא תיחתך) — לכל ווידג'ט
        <div key={w.id} id={`sec-${w.id}`} className={`scroll-mt-6 ${SPAN[w.size] ?? SPAN.full}`}>
          <WidgetRenderer widget={w} currency={currency} dark={dark} accent={accent} palette={palette} />
        </div>
      ))}
    </div>
  );
}
