"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Eye, MousePointerClick, DollarSign, ExternalLink, RefreshCw } from "lucide-react";

interface MetaDataTabProps {
  clientId: string;
}

interface Kpis {
  totalSpend: number;
  totalConversions: number;
  totalImpressions: number;
  totalClicks: number;
  avgCostPerConv: number;
  avgCtr: number;
}

interface DailyPoint {
  date: string;
  spend: number;
  conversions: number;
  clicks: number;
}

interface Campaign {
  id: string;
  name: string;
  spend: number;
  conversions: number;
  clicks: number;
  impressions: number;
  cpc: number;
}

interface PagePost {
  id: string;
  externalId: string;
  message: string;
  permalink: string;
  mediaType: string;
  mediaUrl: string;
  createdTime: string;
  reach: number;
  impressions: number;
  engagement: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews: number;
}

interface IgMediaItem {
  id: string;
  externalId: string;
  caption: string;
  permalink: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string;
  timestamp: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  saves: number;
  videoViews: number;
}

interface MetaData {
  kpis: Kpis;
  dailyChart: DailyPoint[];
  campaigns: Campaign[];
  pagePosts: PagePost[];
  igMedia: IgMediaItem[];
}

const cardClass = "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function formatFullDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function MetaDataTab({ clientId }: MetaDataTabProps) {
  const [data, setData] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/platforms/meta/data/${clientId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-brand-muted" dir="rtl">
        טוען נתונים...
      </div>
    );
  }

  const isEmpty =
    !data ||
    ((!data.kpis || (data.kpis.totalSpend === 0 && data.kpis.totalConversions === 0 && data.kpis.totalImpressions === 0 && data.kpis.totalClicks === 0)) &&
      (!data.dailyChart || data.dailyChart.length === 0) &&
      (!data.campaigns || data.campaigns.length === 0) &&
      (!data.pagePosts || data.pagePosts.length === 0) &&
      (!data.igMedia || data.igMedia.length === 0));

  if (isEmpty) {
    return (
      <div dir="rtl" className="space-y-4">
        <div className="flex items-center justify-end">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm hover:bg-brand-bg"
          >
            <RefreshCw className="h-4 w-4" />
            רענן
          </button>
        </div>
        <div className={`${cardClass} flex flex-col items-center justify-center gap-3 py-16 text-center`}>
          <RefreshCw className="h-10 w-10 text-brand-muted" />
          <p className="text-brand-muted">
            עדיין אין נתונים מסונכרנים — הסנכרון הבא ירוץ בלילה או הפעל ידנית
          </p>
        </div>
      </div>
    );
  }

  const kpis = data!.kpis;
  const campaignsToShow = showAllCampaigns ? data!.campaigns : data!.campaigns.slice(0, 10);

  const chartData = (data!.dailyChart || []).map((d) => ({
    ...d,
    dateLabel: (() => {
      try {
        return new Date(d.date).toLocaleDateString("he-IL", {
          day: "2-digit",
          month: "2-digit",
        });
      } catch {
        return d.date;
      }
    })(),
  }));

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-brand-muted">30 ימים אחרונים</h2>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm hover:bg-brand-bg"
        >
          <RefreshCw className="h-4 w-4" />
          רענן
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-muted">סה״כ הוצאה</p>
            <DollarSign className="h-5 w-5 text-brand-muted" />
          </div>
          <p className="mt-2 text-2xl font-bold">₪ {kpis.totalSpend.toLocaleString()}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-muted">סה״כ המרות</p>
            <TrendingUp className="h-5 w-5 text-brand-muted" />
          </div>
          <p className="mt-2 text-2xl font-bold">{kpis.totalConversions}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-muted">עלות ממוצעת להמרה</p>
            <DollarSign className="h-5 w-5 text-brand-muted" />
          </div>
          <p className="mt-2 text-2xl font-bold">₪ {Math.round(kpis.avgCostPerConv)}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-muted">CTR ממוצע</p>
            <MousePointerClick className="h-5 w-5 text-brand-muted" />
          </div>
          <p className="mt-2 text-2xl font-bold">{kpis.avgCtr.toFixed(2)}%</p>
        </div>
      </div>

      {/* Daily Chart */}
      {chartData.length > 0 && (
        <div className={cardClass}>
          <h3 className="mb-4 text-lg font-semibold">ביצועים יומיים</h3>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="spend"
                  name="הוצאה (₪)"
                  stroke="#eed89b"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="conversions"
                  name="המרות"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Campaigns Table */}
      {data!.campaigns.length > 0 && (
        <div className={cardClass}>
          <h3 className="mb-4 text-lg font-semibold">קמפיינים</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border text-right text-brand-muted">
                  <th className="py-2 font-medium">שם קמפיין</th>
                  <th className="py-2 font-medium">הוצאה</th>
                  <th className="py-2 font-medium">קליקים</th>
                  <th className="py-2 font-medium">המרות</th>
                  <th className="py-2 font-medium">CPC</th>
                </tr>
              </thead>
              <tbody>
                {campaignsToShow.map((c) => (
                  <tr key={c.id} className="border-b border-brand-border/50">
                    <td className="py-2">{c.name}</td>
                    <td className="py-2">₪ {c.spend.toLocaleString()}</td>
                    <td className="py-2">{c.clicks}</td>
                    <td className="py-2">{c.conversions}</td>
                    <td className="py-2">₪ {c.cpc.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data!.campaigns.length > 10 && !showAllCampaigns && (
            <button
              onClick={() => setShowAllCampaigns(true)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              הצג הכל
            </button>
          )}
        </div>
      )}

      {/* Facebook Posts */}
      {data!.pagePosts && data!.pagePosts.length > 0 && (
        <div className={cardClass}>
          <h3 className="mb-4 text-lg font-semibold">פוסטים אחרונים בפייסבוק</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data!.pagePosts.slice(0, 6).map((post) => (
              <div
                key={post.id}
                className="flex flex-col gap-2 rounded-lg border border-brand-border bg-white p-3"
              >
                {post.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.mediaUrl}
                    alt=""
                    className="h-32 w-full rounded object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded bg-brand-bg text-brand-muted">
                    <Eye className="h-6 w-6" />
                  </div>
                )}
                <p className="text-sm">{truncate(post.message, 80)}</p>
                <div className="grid grid-cols-3 gap-1 text-xs text-brand-muted">
                  <span>חשיפה: {post.reach}</span>
                  <span>הופעות: {post.impressions}</span>
                  <span>מעורבות: {post.engagement}</span>
                  <span>תגובות רגשיות: {post.reactions}</span>
                  <span>תגובות: {post.comments}</span>
                  <span>שיתופים: {post.shares}</span>
                </div>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-brand-muted">{formatFullDate(post.createdTime)}</span>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      פתח
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instagram Media */}
      {data!.igMedia && data!.igMedia.length > 0 && (
        <div className={cardClass}>
          <h3 className="mb-4 text-lg font-semibold">פוסטים אחרונים באינסטגרם</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data!.igMedia.slice(0, 6).map((item) => {
              const thumb =
                item.mediaType === "VIDEO" || item.mediaType === "REELS"
                  ? item.thumbnailUrl || item.mediaUrl
                  : item.mediaUrl;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-brand-border bg-white p-3"
                >
                  <div className="relative">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-32 w-full rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-32 w-full items-center justify-center rounded bg-brand-bg text-brand-muted">
                        <Eye className="h-6 w-6" />
                      </div>
                    )}
                    <span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                      {item.mediaType}
                    </span>
                  </div>
                  <p className="text-sm">{truncate(item.caption, 80)}</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-brand-muted">
                    <span>לייקים: {item.likes}</span>
                    <span>תגובות: {item.comments}</span>
                    <span>שמירות: {item.saves}</span>
                    <span>חשיפה: {item.reach}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-brand-muted">{formatFullDate(item.timestamp)}</span>
                    {item.permalink && (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        פתח
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
