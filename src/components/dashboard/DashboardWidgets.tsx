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

const LOWER_BETTER = new Set(["cpa", "cpc", "cpm"]);
function Delta({ id, change }: { id: string; change?: number | null }) {
  if (change === null || change === undefined) return null;
  const good = LOWER_BETTER.has(id) ? change < 0 : change > 0;
  const cls =
    change === 0
      ? "bg-brand-bg text-brand-muted"
      : good
        ? "bg-green-50 text-green-700"
        : "bg-red-50 text-red-600";
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`} title="לעומת התקופה הקודמת">
      {arrow} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

/** מצב ריק ידידותי — במקום כרטיס לבן ריק שנראה כמו תקלה */
function NoData({ note }: { note?: string }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 py-6 text-center">
      <svg className="h-6 w-6 text-brand-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5V19a1.5 1.5 0 001.5 1.5h15A1.5 1.5 0 0021 19v-5.5M3 13.5L9 7l4 4 8-8M3 13.5h18" />
      </svg>
      <p className="text-xs text-brand-muted">{note ?? "אין נתונים בטווח שנבחר"}</p>
    </div>
  );
}

/** האם לסדרת נתונים יש בכלל ערכים להצגה */
const seriesHasData = (d: SeriesResult) => d.buckets.length > 0 && d.series.some((s) => s.values.some((v) => v !== 0));

export interface WidgetDTO { id: string; title: string; displayType: string; size: string; platforms?: string[]; data: WidgetData }

const PIE_COLORS = ["#eed89b", "#000000", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
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

function KpiView({ data, currency }: { data: KpiResult; currency: string }) {
  const n = data.metrics.length;
  if (n === 1) {
    const m = data.metrics[0];
    return (
      <div className="mt-2 flex flex-col gap-1">
        <p className="text-3xl font-semibold text-brand-dark">{formatByUnit(m.value, m.unit, currency)}</p>
        <Delta id={m.id} change={m.change} />
      </div>
    );
  }
  // שורה מאוזנת: כל המדדים באותה שורה (בדסקטופ), בלי "חורים" של grid-cols-2
  const cols = n === 2 ? "sm:grid-cols-2" : n === 3 ? "sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4";
  return (
    <div className={`mt-3 grid grid-cols-1 gap-4 ${cols}`}>
      {data.metrics.map((m, i) => (
        <div key={m.id} className={`flex flex-col gap-1 ${i > 0 ? "sm:border-r sm:border-brand-border sm:pr-4" : ""}`}>
          <p className="text-xs text-brand-muted">{m.label}</p>
          <p className="text-2xl font-semibold text-brand-dark">{formatByUnit(m.value, m.unit, currency)}</p>
          <Delta id={m.id} change={m.change} />
        </div>
      ))}
    </div>
  );
}

function SeriesView({ data }: { data: SeriesResult }) {
  if (!seriesHasData(data)) return <NoData />;
  const chartData = data.buckets.map((b, i) => {
    const row: Record<string, string | number> = { bucket: b };
    for (const s of data.series) row[s.id] = s.values[i] ?? 0;
    return row;
  });
  // קווים דקים בזהב בהיר נעלמים על רקע לבן — לקווים/שטח קו-מתאר כהה; מילוי עמודות נשאר זהב
  const colors = data.display === "bar" ? ["#eed89b", "#3b82f6", "#22c55e"] : ["#111111", "#3b82f6", "#f59e0b"];
  if (data.display === "bar") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "#666" }} />
          <YAxis tick={{ fontSize: 11, fill: "#666" }} width={44} />
          <Tooltip labelFormatter={(l) => fmtDate(String(l))} contentStyle={{ borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 12 }} />
          {data.series.map((s, i) => <Bar key={s.id} dataKey={s.id} name={s.label} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  const Chart = data.display === "area" ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <Chart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
        <defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eed89b" stopOpacity={0.5} /><stop offset="100%" stopColor="#eed89b" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "#666" }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#666" }} width={44} />
        <Tooltip labelFormatter={(l) => fmtDate(String(l))} formatter={(v) => fmtNum(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 12 }} />
        {data.series.map((s, i) =>
          data.display === "area"
            ? <Area key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={colors[i % colors.length]} strokeWidth={2} fill={i === 0 ? "url(#wgrad)" : "transparent"} />
            : <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

function PieView({ data }: { data: PieResult }) {
  const total = data.slices.reduce((s, x) => s + x.value, 0);
  if (data.slices.length === 0 || total === 0) return <NoData />;
  // דונאט + מקרא עם אחוזים — קריא יותר מתוויות על הפרוסות (במיוחד במובייל)
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
      <div className="h-[190px] w-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* paddingAngle עם פרוסה אחת שובר את הציור ב-recharts — רק כשיש כמה פרוסות */}
            <Pie data={data.slices} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={data.slices.length > 1 ? 2 : 0} strokeWidth={0} isAnimationActive={false}>
              {data.slices.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => fmtNum(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 sm:w-auto">
        {data.slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-brand-dark">{s.label}</span>
            <span className="text-brand-muted">· {fmtNum(s.value)} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableView({ data }: { data: TableResult }) {
  if (data.rows.length === 0) return <NoData />;
  return (
    <div className="mt-2 max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-brand-light">
          <tr className="border-b border-brand-border text-brand-muted">
            {data.columns.map((c) => <th key={c.id} className="px-2 py-2 text-right font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-b border-brand-border/40 odd:bg-brand-bg/40">
              {row.map((cell, j) => (
                <td key={j} className={`px-2 py-2 text-right ${j === 0 ? "font-medium text-brand-dark" : "text-brand-dark"}`}>
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

export function WidgetRenderer({ widget, currency }: { widget: WidgetDTO; currency: string }) {
  const { data } = widget;
  const platforms = widget.platforms ?? [];

  // כותרת פלטפורמה — לוגו גדול + שם הפלטפורמה
  if (widget.displayType === "platform_header") {
    const names = platforms.map((p) => PLATFORM_DISPLAY_NAMES[p] ?? p).join(" + ");
    return (
      <div className="flex items-center gap-3 border-b-2 border-brand-gold pb-3 pt-4">
        <PlatformLogos platforms={platforms} className="h-8 w-8" />
        <h2 className="text-xl font-bold text-brand-dark">{widget.title || names}</h2>
      </div>
    );
  }

  // כותרת / מפריד — בלי תיבת כרטיס
  if (data.type === "text" && data.heading) {
    return <div className="border-b-2 border-brand-gold pb-2 pt-4"><h2 className="text-xl font-bold text-brand-dark">{widget.title}</h2></div>;
  }
  if (data.type === "text") {
    return (
      <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
        {widget.title && <p className="mb-1 text-sm font-semibold text-brand-dark">{widget.title}</p>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-dark">{data.body}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-dark">{widget.title || " "}</p>
        <PlatformLogos platforms={platforms} />
      </div>
      {data.type === "empty" ? (
        <NoData note={data.reason} />
      ) : data.type === "kpi" ? (
        <KpiView data={data} currency={currency} />
      ) : data.type === "series" ? (
        <div className="mt-3"><SeriesView data={data} /></div>
      ) : data.type === "pie" ? (
        <div className="mt-3"><PieView data={data} /></div>
      ) : (
        <TableView data={data} />
      )}
    </div>
  );
}

const SPAN: Record<string, string> = { full: "md:col-span-12", half: "md:col-span-6", third: "md:col-span-4" };

export function WidgetGrid({ widgets, currency }: { widgets: WidgetDTO[]; currency: string }) {
  if (widgets.length === 0) {
    return <p className="py-12 text-center text-sm text-brand-muted">אין ווידג&apos;טים בדשבורד עדיין.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      {widgets.map((w) => (
        <div key={w.id} className={SPAN[w.size] ?? SPAN.full}>
          <WidgetRenderer widget={w} currency={currency} />
        </div>
      ))}
    </div>
  );
}
