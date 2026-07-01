"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2, RefreshCw } from "lucide-react";
import DateRangePicker, { DateRange, getPresetRange } from "./DateRangePicker";
import CampaignTrendTable from "./CampaignTrendTable";
import { getCurrencySymbol } from "@/lib/utils/currency";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  clientId: string;
  currency: string;
}

interface Campaign {
  [key: string]: string | number;
  id: string;
  name: string;
  status: string;
  objectiveType: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  conversions: number;
  costPerConversion: number;
  ctr: number;
  cpc: number;
  cpm: number;
  videoViews: number;
  likes: number;
  comments: number;
  shares: number;
  follows: number;
  profileVisits: number;
}

type ColumnKey =
  | "name" | "objectiveType" | "status"
  | "spend" | "impressions" | "clicks" | "reach"
  | "conversions" | "costPerConversion"
  | "ctr" | "cpc" | "cpm"
  | "videoViews" | "likes" | "comments" | "shares";

type ColumnType = "text" | "money" | "number" | "percent";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  type: ColumnType;
}

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "שם קמפיין (name)", type: "text" },
  { key: "objectiveType", label: "מטרה (objective)", type: "text" },
  { key: "status", label: "סטטוס (status)", type: "text" },
  { key: "spend", label: "הוצאה (spend)", type: "money" },
  { key: "impressions", label: "חשיפות (impressions)", type: "number" },
  { key: "clicks", label: "קליקים (clicks)", type: "number" },
  { key: "reach", label: "חשיפה ייחודית (reach)", type: "number" },
  { key: "conversions", label: "המרות (conversions)", type: "number" },
  { key: "costPerConversion", label: "עלות להמרה (CPA)", type: "money" },
  { key: "ctr", label: "CTR", type: "percent" },
  { key: "cpc", label: "CPC", type: "money" },
  { key: "cpm", label: "CPM", type: "money" },
  { key: "videoViews", label: "צפיות וידאו (video_views)", type: "number" },
  { key: "likes", label: "לייקים (likes)", type: "number" },
  { key: "comments", label: "תגובות (comments)", type: "number" },
  { key: "shares", label: "שיתופים (shares)", type: "number" },
];

const DEFAULT_VISIBLE: ColumnKey[] = [
  "name", "spend", "impressions", "clicks",
  "conversions", "costPerConversion", "videoViews",
];

function formatValue(value: number, type: ColumnType, sym: string): string {
  if (!Number.isFinite(value)) return "-";
  switch (type) {
    case "money": return `${sym}${Math.round(value).toLocaleString()}`;
    case "percent": return `${(value * 100).toFixed(2)}%`;
    case "number": return Math.round(value).toLocaleString();
    default: return String(value);
  }
}

const STATUS_LABELS: Record<string, string> = {
  ENABLE: "פעיל",
  DISABLE: "מושהה",
};

export default function TikTokCampaignsTab({ clientId, currency }: Props) {
  const { t } = useLanguage();
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this_month"));
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE));
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false);
  const [data, setData] = useState<{ campaigns: Campaign[]; currency: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sym = getCurrencySymbol(data?.currency || currency);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/tiktok-campaigns?since=${dateRange.since}&until=${dateRange.until}`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setData(json);
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [clientId, dateRange]);

  // סגירת dropdown בלחיצה בחוץ
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setColumnsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch(`/api/platforms/tiktok/sync/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 30 }),
      });
      // רענון נתונים
      const res = await fetch(`/api/clients/${clientId}/tiktok-campaigns?since=${dateRange.since}&until=${dateRange.until}`);
      if (res.ok) setData(await res.json());
    } catch {}
    finally { setSyncing(false); }
  }

  const campaigns = data?.campaigns ?? [];
  const cols = COLUMNS.filter((c) => visibleColumns.has(c.key));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
            <span className="text-sm font-bold text-white">T</span>
          </div>
          <h3 className="text-base font-semibold text-brand-dark">TikTok Ads</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("syncing") || "מסנכרן..." : t("sync_now") || "סנכרן עכשיו"}
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setColumnsDropdownOpen(!columnsDropdownOpen)}
              className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-xs text-brand-dark hover:bg-brand-bg"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t("columns") || "עמודות"}
            </button>
            {columnsDropdownOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-brand-border bg-brand-light p-2 shadow-lg">
                {COLUMNS.map((col) => (
                  <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-xs hover:bg-brand-bg">
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(col.key)}
                      onChange={() => {
                        setVisibleColumns((prev) => {
                          const next = new Set(prev);
                          if (next.has(col.key)) next.delete(col.key);
                          else next.add(col.key);
                          return next;
                        });
                      }}
                      className="h-3.5 w-3.5 rounded border-brand-border"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-brand-muted">{t("loading_tiktok") || "טוען נתוני TikTok Ads..."}</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-brand-border bg-brand-light p-8 text-center">
          <p className="text-sm text-brand-muted">{t("no_tiktok_data") || "אין נתוני TikTok Ads בתקופה זו."}</p>
          <p className="mt-1 text-xs text-brand-muted">{t("no_tiktok_data_hint") || 'ודא שחשבון מחובר ונבחר, ולחץ "סנכרן עכשיו"'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg">
                {cols.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-brand-muted">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {campaigns.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-brand-bg/50">
                  {cols.map((col) => {
                    let display: string;
                    if (col.key === "status") {
                      display = STATUS_LABELS[String(c.status)] ?? String(c.status);
                    } else if (col.type === "text") {
                      display = String(c[col.key] ?? "\u2014");
                    } else {
                      display = formatValue(Number(c[col.key] ?? 0), col.type, sym);
                    }
                    return (
                      <td key={col.key} className={`whitespace-nowrap px-3 py-2.5 ${col.type === "text" ? "text-brand-dark" : "text-brand-dark font-mono"}`}>
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t-2 border-brand-dark bg-brand-bg font-semibold">
                {cols.map((col) => {
                  if (col.key === "name") return <td key={col.key} className="px-3 py-2.5 text-brand-dark">{t("total") || 'סה"כ'}</td>;
                  if (col.type === "text") return <td key={col.key} className="px-3 py-2.5" />;
                  const sum = campaigns.reduce((s, c) => s + Number(c[col.key] ?? 0), 0);
                  const avg = campaigns.length > 0 ? sum / campaigns.length : 0;
                  const val = ["ctr", "cpc", "cpm", "costPerConversion"].includes(col.key) ? avg : sum;
                  return (
                    <td key={col.key} className="whitespace-nowrap px-3 py-2.5 font-mono text-brand-dark">
                      {formatValue(val, col.type, sym)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <CampaignTrendTable clientId={clientId} endpoint="tiktok-campaigns" currency={currency} />
    </div>
  );
}
