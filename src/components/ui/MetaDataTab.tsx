"use client";

import { useEffect, useState, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { RefreshCw, TrendingUp, Eye, MousePointerClick, DollarSign, Target as TargetIcon, ShoppingBag, Users2, Play } from "lucide-react";
import DateRangePicker, { getPresetRange, type DateRange } from "./DateRangePicker";

interface MetaDataTabProps {
  clientId: string;
}

interface Kpis {
  totalSpend: number; totalConversions: number; totalImpressions: number; totalClicks: number; totalReach: number;
  totalPurchases: number; totalPurchaseValue: number; totalLeads: number; totalLinkClicks: number;
  totalLandingPageViews: number; totalVideoViews: number;
  avgCostPerConv: number; avgCostPerLead: number; avgCtr: number; avgCpc: number; avgCpm: number; roas: number;
}

interface DailyPoint { date: string; spend: number; conversions: number; clicks: number; impressions: number; }
interface Campaign { id: string; name: string; spend: number; conversions: number; clicks: number; impressions: number; cpc: number; cpa: number; roas: number; purchases: number; leads: number; }
interface Post { id: string; externalId: string; message: string; permalink: string; mediaType: string; mediaUrl: string; createdTime: string; reach: number; impressions: number; engagement: number; reactions: number; comments: number; shares: number; clicks: number; videoViews: number; }
interface Media { id: string; externalId: string; caption: string; permalink: string; mediaType: string; mediaUrl: string; thumbnailUrl: string; timestamp: string; reach: number; impressions: number; likes: number; comments: number; saves: number; videoViews: number; }

interface Data {
  kpis: Kpis;
  dailyChart: DailyPoint[];
  campaigns: Campaign[];
  pagePosts: Post[];
  igMedia: Media[];
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("he-IL");
}

function formatCurrency(n: number): string {
  return `₪ ${Math.round(n).toLocaleString("he-IL")}`;
}

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

export default function MetaDataTab({ clientId }: MetaDataTabProps) {
  const [range, setRange] = useState<DateRange>(() => getPresetRange("this_month"));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/platforms/meta/data/${clientId}?since=${range.since}&until=${range.until}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [clientId, range.since, range.until]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/platforms/meta/sync/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 90 }),
      });
      await fetchData();
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !data) {
    return <p className="text-center text-brand-muted">טוען נתונים...</p>;
  }

  if (!data || (data.kpis.totalSpend === 0 && data.campaigns.length === 0 && data.pagePosts.length === 0 && data.igMedia.length === 0)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-light p-8 text-center shadow-sm">
          <RefreshCw className="mx-auto mb-3 h-8 w-8 text-brand-muted" />
          <p className="mb-3 text-brand-dark">עדיין אין נתונים מסונכרנים</p>
          <p className="mb-4 text-sm text-brand-muted">הסנכרון הבא ירוץ בלילה או אפשר להפעיל ידנית</p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
          >
            {syncing ? "מסנכרן..." : "סנכרן עכשיו"}
          </button>
        </div>
      </div>
    );
  }

  const kpiCards = [
    { label: "הוצאה", value: formatCurrency(data.kpis.totalSpend), icon: DollarSign },
    { label: "המרות", value: formatNumber(data.kpis.totalConversions), icon: TargetIcon },
    { label: "רכישות", value: formatNumber(data.kpis.totalPurchases), icon: ShoppingBag },
    { label: "לידים", value: formatNumber(data.kpis.totalLeads), icon: Users2 },
    { label: "עלות להמרה", value: formatCurrency(data.kpis.avgCostPerConv), icon: DollarSign },
    { label: "עלות לליד", value: formatCurrency(data.kpis.avgCostPerLead), icon: DollarSign },
    { label: "ROAS", value: data.kpis.roas.toFixed(2), icon: TrendingUp },
    { label: "CTR", value: `${data.kpis.avgCtr.toFixed(2)}%`, icon: MousePointerClick },
    { label: "CPC", value: formatCurrency(data.kpis.avgCpc), icon: DollarSign },
    { label: "CPM", value: formatCurrency(data.kpis.avgCpm), icon: Eye },
    { label: "הופעות", value: formatNumber(data.kpis.totalImpressions), icon: Eye },
    { label: "חשיפה", value: formatNumber(data.kpis.totalReach), icon: Eye },
    { label: "קליקים", value: formatNumber(data.kpis.totalClicks), icon: MousePointerClick },
    { label: "קליקי קישור", value: formatNumber(data.kpis.totalLinkClicks), icon: MousePointerClick },
    { label: "דפי נחיתה", value: formatNumber(data.kpis.totalLandingPageViews), icon: Eye },
    { label: "צפיות וידאו", value: formatNumber(data.kpis.totalVideoViews), icon: Play },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-bg disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "מסנכרן..." : "סנכרן עכשיו"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-brand-muted">{kpi.label}</p>
                <Icon className="h-4 w-4 text-brand-muted" />
              </div>
              <p className="mt-1 text-xl font-semibold text-brand-dark">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {data.dailyChart.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-brand-dark">ביצועים יומיים</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.dailyChart.map((d) => ({ ...d, dateLabel: formatDate(d.date) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} reversed />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="left" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#eed89b" strokeWidth={2} name="הוצאה ₪" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#3b82f6" strokeWidth={2} name="המרות" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.campaigns.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <h3 className="border-b border-brand-border px-6 py-4 text-lg font-semibold text-brand-dark">קמפיינים</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50">
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">שם</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">הוצאה</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">הופעות</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">קליקים</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">המרות</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">רכישות</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">CPA</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.slice(0, 15).map((c) => (
                  <tr key={c.id} className="border-b border-brand-border">
                    <td className="px-4 py-3 font-medium text-brand-dark">{c.name}</td>
                    <td className="px-4 py-3 text-brand-dark">{formatCurrency(c.spend)}</td>
                    <td className="px-4 py-3 text-brand-muted">{formatNumber(c.impressions)}</td>
                    <td className="px-4 py-3 text-brand-muted">{formatNumber(c.clicks)}</td>
                    <td className="px-4 py-3 text-brand-dark">{formatNumber(c.conversions)}</td>
                    <td className="px-4 py-3 text-brand-dark">{formatNumber(c.purchases)}</td>
                    <td className="px-4 py-3 text-brand-dark">{formatCurrency(c.cpa)}</td>
                    <td className="px-4 py-3 font-medium text-brand-dark">{c.roas.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.pagePosts.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-brand-dark">פוסטים אחרונים בפייסבוק</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.pagePosts.slice(0, 6).map((p) => (
              <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-brand-border p-3 hover:bg-brand-bg/30">
                {p.mediaUrl && p.mediaType === "photo" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.mediaUrl} alt="" className="mb-2 h-32 w-full rounded object-cover" />
                )}
                <p className="line-clamp-2 text-xs text-brand-dark">{p.message || "(ללא טקסט)"}</p>
                <p className="mt-1 text-[10px] text-brand-muted">{new Date(p.createdTime).toLocaleDateString("he-IL")}</p>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-brand-muted">
                  <span>חשיפה: {formatNumber(p.reach)}</span>
                  <span>הופעות: {formatNumber(p.impressions)}</span>
                  <span>ריאקציות: {formatNumber(p.reactions)}</span>
                  <span>תגובות: {formatNumber(p.comments)}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {data.igMedia.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-brand-dark">פוסטים אחרונים באינסטגרם</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.igMedia.slice(0, 6).map((m) => {
              const thumb = m.mediaType === "VIDEO" || m.mediaType === "REELS" ? m.thumbnailUrl : m.mediaUrl;
              return (
                <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-brand-border p-3 hover:bg-brand-bg/30">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="mb-2 h-32 w-full rounded object-cover" />
                  )}
                  <span className="inline-block rounded bg-brand-gold/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-dark">{m.mediaType}</span>
                  <p className="mt-1 line-clamp-2 text-xs text-brand-dark">{m.caption || "(ללא כיתוב)"}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-brand-muted">
                    <span>לייקים: {formatNumber(m.likes)}</span>
                    <span>תגובות: {formatNumber(m.comments)}</span>
                    <span>שמירות: {formatNumber(m.saves)}</span>
                    <span>חשיפה: {formatNumber(m.reach)}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
