"use client";

import { ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { getCurrencySymbol } from "@/lib/utils/currency";

// ----- טיפוסי נתונים (תואמים ל-engine WidgetData) -----
interface KpiResult { type: "kpi"; metrics: { id: string; label: string; value: number; unit: string }[] }
interface SeriesResult { type: "series"; display: "line" | "area" | "bar"; buckets: string[]; series: { id: string; label: string; values: number[] }[] }
interface TableResult { type: "table"; columns: { id: string; label: string }[]; rows: (string | number)[][] }
interface PieResult { type: "pie"; metricId: string; label: string; slices: { label: string; value: number }[] }
interface EmptyResult { type: "empty"; reason: string }
export type WidgetData = KpiResult | SeriesResult | TableResult | PieResult | EmptyResult;

export interface WidgetDTO { id: string; title: string; displayType: string; size: string; data: WidgetData }

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
  const single = data.metrics.length === 1;
  if (single) {
    const m = data.metrics[0];
    return <p className="mt-2 text-3xl font-semibold text-brand-dark">{formatByUnit(m.value, m.unit, currency)}</p>;
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-3">
      {data.metrics.map((m) => (
        <div key={m.id}>
          <p className="text-xs text-brand-muted">{m.label}</p>
          <p className="text-xl font-semibold text-brand-dark">{formatByUnit(m.value, m.unit, currency)}</p>
        </div>
      ))}
    </div>
  );
}

function SeriesView({ data }: { data: SeriesResult }) {
  const chartData = data.buckets.map((b, i) => {
    const row: Record<string, string | number> = { bucket: b };
    for (const s of data.series) row[s.id] = s.values[i] ?? 0;
    return row;
  });
  const colors = ["#eed89b", "#3b82f6", "#22c55e"];
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
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data.slices} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80} label={(e) => String((e as { name?: string }).name ?? "")}>
          {data.slices.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => fmtNum(Number(v))} contentStyle={{ borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function TableView({ data }: { data: TableResult }) {
  return (
    <div className="mt-2 max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-brand-border text-brand-muted">
            {data.columns.map((c) => <th key={c.id} className="px-2 py-1.5 text-right font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-b border-brand-border/50">
              {row.map((cell, j) => <td key={j} className="px-2 py-1.5 text-right text-brand-dark">{typeof cell === "number" ? fmtNum(cell) : cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WidgetRenderer({ widget, currency }: { widget: WidgetDTO; currency: string }) {
  const { data } = widget;
  return (
    <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
      <p className="text-sm font-semibold text-brand-dark">{widget.title || " "}</p>
      {data.type === "empty" ? (
        <p className="py-6 text-center text-xs text-brand-muted">{data.reason}</p>
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
    return <p className="py-12 text-center text-sm text-brand-muted">אין ווידג'טים בדשבורד עדיין.</p>;
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
