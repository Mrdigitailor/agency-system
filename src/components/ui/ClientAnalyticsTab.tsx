"use client";

import { useState, useEffect, useCallback } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { BarChart3, Loader2, Users, MousePointerClick, Eye, Clock, RefreshCw } from "lucide-react";

interface Analytics {
  connected: boolean;
  error?: string;
  property?: { id: string; name: string };
  days?: number;
  summary?: {
    users: number;
    newUsers: number;
    sessions: number;
    pageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
    events: number;
  };
  channels?: Array<{ name: string; sessions: number }>;
  topPages?: Array<{ path: string; views: number }>;
  timeseries?: Array<{ date: string; sessions: number; users: number }>;
}

const cardClass = "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");
const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const fmtDate = (d: string) => {
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
};

const RANGES = [
  { days: 7, label: "7 ימים" },
  { days: 28, label: "28 ימים" },
  { days: 90, label: "90 ימים" },
];

export default function ClientAnalyticsTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(28);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/analytics?days=${d}`);
      setData(await res.json());
    } catch {
      setData({ connected: true, error: "שגיאה בטעינה" });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load(days);
  }, [load, days]);

  if (loading && !data) {
    return (
      <div className={cardClass}>
        <div className="flex items-center justify-center py-12 text-brand-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </div>
    );
  }

  // לא מחובר
  if (data && !data.connected) {
    return (
      <div className={cardClass}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="mb-3 h-10 w-10 text-brand-muted/50" />
          <p className="text-sm text-brand-muted">חבר את Google Analytics בלשונית פרטי הלקוח כדי לראות נתונים.</p>
        </div>
      </div>
    );
  }

  // שגיאה
  if (data?.error) {
    return (
      <div className={cardClass}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="mb-3 h-10 w-10 text-brand-danger/50" />
          <p className="text-sm text-brand-danger">{data.error}</p>
          <button
            onClick={() => load(days)}
            className="mt-4 flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-muted hover:bg-brand-bg"
          >
            <RefreshCw className="h-3.5 w-3.5" /> נסה שוב
          </button>
        </div>
      </div>
    );
  }

  const s = data?.summary;
  const kpis = [
    { label: "משתמשים", value: s ? fmt(s.users) : "—", icon: Users },
    { label: "סשנים", value: s ? fmt(s.sessions) : "—", icon: MousePointerClick },
    { label: "צפיות בדפים", value: s ? fmt(s.pageViews) : "—", icon: Eye },
    { label: "משך סשן ממוצע", value: s ? fmtDuration(s.avgSessionDuration) : "—", icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-dark">אנליטיקס</h2>
          {data?.property && <p className="text-xs text-brand-muted">{data.property.name}</p>}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                days === r.days ? "bg-brand-gold text-brand-dark" : "text-brand-muted hover:text-brand-dark"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={cardClass}>
            <div className="flex items-center gap-2">
              <kpi.icon className="h-4 w-4 text-brand-gold" />
              <p className="text-xs font-medium text-brand-muted">{kpi.label}</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-brand-dark">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* גרף מגמה */}
      {data?.timeseries && data.timeseries.length > 0 && (
        <div className={cardClass}>
          <p className="mb-4 text-sm font-semibold text-brand-dark">סשנים לאורך זמן</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.timeseries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="ga4grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#eed89b" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#eed89b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: "#666" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "#666" }} width={40} />
              <Tooltip
                labelFormatter={(l) => fmtDate(String(l))}
                formatter={(v, n) => [fmt(Number(v)), n === "sessions" ? "סשנים" : "משתמשים"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="sessions" stroke="#eed89b" strokeWidth={2} fill="url(#ga4grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ערוצי תנועה */}
        <div className={cardClass}>
          <p className="mb-4 text-sm font-semibold text-brand-dark">מקורות תנועה</p>
          {data?.channels && data.channels.length > 0 ? (
            <div className="space-y-2">
              {(() => {
                const max = Math.max(...data.channels.map((c) => c.sessions), 1);
                return data.channels.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-brand-dark">{c.name}</span>
                      <span className="text-brand-muted">{fmt(c.sessions)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-brand-bg">
                      <div className="h-full rounded-full bg-brand-gold" style={{ width: `${(c.sessions / max) * 100}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <p className="text-sm text-brand-muted">אין נתונים</p>
          )}
        </div>

        {/* דפים מובילים */}
        <div className={cardClass}>
          <p className="mb-4 text-sm font-semibold text-brand-dark">דפים פופולריים</p>
          {data?.topPages && data.topPages.length > 0 ? (
            <div className="space-y-2">
              {data.topPages.map((p) => (
                <div key={p.path} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-brand-dark" dir="ltr" title={p.path}>{p.path}</span>
                  <span className="shrink-0 text-brand-muted">{fmt(p.views)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-muted">אין נתונים</p>
          )}
        </div>
      </div>
    </div>
  );
}
