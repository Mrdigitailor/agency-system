"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2, RefreshCw } from "lucide-react";
import DateRangePicker, { DateRange, getPresetRange } from "./DateRangePicker";
import { getCurrencySymbol } from "@/lib/utils/currency";

interface Props {
  clientId: string;
  currency: string;
}

interface Campaign {
  [key: string]: string | number;
  id: string;
  name: string;
  status: string;
  channelType: string;
  budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  costPerConversion: number;
  ctr: number;
  averageCpc: number;
  averageCpm: number;
  interactions: number;
  allConversions: number;
  allConversionsValue: number;
  videoViews: number;
  searchImprShare: number;
  contentImprShare: number;
  roas: number;
}

type ColumnKey =
  | "name" | "status" | "channelType" | "budget"
  | "spend" | "impressions" | "clicks"
  | "conversions" | "conversionsValue" | "costPerConversion"
  | "ctr" | "averageCpc" | "averageCpm" | "roas"
  | "interactions" | "allConversions" | "allConversionsValue"
  | "videoViews" | "searchImprShare" | "contentImprShare";

type ColumnType = "text" | "money" | "number" | "percent" | "roas";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  type: ColumnType;
}

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "שם קמפיין (name)", type: "text" },
  { key: "channelType", label: "סוג קמפיין (channel_type)", type: "text" },
  { key: "status", label: "סטטוס (status)", type: "text" },
  { key: "budget", label: "תקציב יומי (budget)", type: "money" },
  { key: "spend", label: "הוצאה (cost)", type: "money" },
  { key: "impressions", label: "חשיפות (impressions)", type: "number" },
  { key: "clicks", label: "קליקים (clicks)", type: "number" },
  { key: "conversions", label: "המרות (conversions)", type: "number" },
  { key: "conversionsValue", label: "ערך המרות (value)", type: "money" },
  { key: "costPerConversion", label: "עלות להמרה (CPA)", type: "money" },
  { key: "ctr", label: "CTR", type: "percent" },
  { key: "averageCpc", label: "CPC ממוצע (avg_cpc)", type: "money" },
  { key: "averageCpm", label: "CPM ממוצע (avg_cpm)", type: "money" },
  { key: "roas", label: "ROAS", type: "roas" },
  { key: "videoViews", label: "צפיות וידאו (video_views)", type: "number" },
  { key: "searchImprShare", label: "נתח חשיפה חיפוש (search_impr_share)", type: "percent" },
  { key: "contentImprShare", label: "נתח חשיפה תוכן (content_impr_share)", type: "percent" },
  { key: "interactions", label: "אינטראקציות (interactions)", type: "number" },
  { key: "allConversions", label: "כל ההמרות (all_conv)", type: "number" },
  { key: "allConversionsValue", label: "ערך כל ההמרות (all_conv_value)", type: "money" },
];

const DEFAULT_VISIBLE: ColumnKey[] = [
  "name", "channelType", "spend", "impressions", "clicks",
  "conversions", "costPerConversion", "roas",
];

function formatValue(value: number, type: ColumnType, sym: string): string {
  if (!Number.isFinite(value)) return "-";
  switch (type) {
    case "money": return `${sym}${Math.round(value).toLocaleString()}`;
    case "percent": return `${(value * 100).toFixed(2)}%`;
    case "roas": return value.toFixed(2);
    case "number": return Math.round(value).toLocaleString();
    default: return String(value);
  }
}

const STATUS_LABELS: Record<string, string> = {
  ENABLED: "פעיל",
  PAUSED: "מושהה",
  REMOVED: "הוסר",
};

const CHANNEL_LABELS: Record<string, string> = {
  SEARCH: "חיפוש",
  DISPLAY: "רשת מדיה",
  VIDEO: "וידאו",
  SHOPPING: "שופינג",
  PERFORMANCE_MAX: "Performance Max",
  MULTI_CHANNEL: "רב ערוצי",
  LOCAL: "מקומי",
  SMART: "Smart",
  DISCOVERY: "Discovery",
  DEMAND_GEN: "Demand Gen",
};

export default function GoogleAdsCampaignsTab({ clientId, currency }: Props) {
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
        const res = await fetch(`/api/clients/${clientId}/google-campaigns?since=${dateRange.since}&until=${dateRange.until}`);
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
      await fetch(`/api/platforms/google-ads/sync/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 30 }),
      });
      // רענון נתונים
      const res = await fetch(`/api/clients/${clientId}/google-campaigns?since=${dateRange.since}&until=${dateRange.until}`);
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4285F4]">
            <span className="text-sm font-bold text-white">G</span>
          </div>
          <h3 className="text-base font-semibold text-brand-dark">Google Ads</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "מסנכרן..." : "סנכרן עכשיו"}
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setColumnsDropdownOpen(!columnsDropdownOpen)}
              className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-xs text-brand-dark hover:bg-brand-bg"
            >
              <Settings2 className="h-3.5 w-3.5" />
              עמודות
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
        <p className="py-8 text-center text-sm text-brand-muted">טוען נתוני Google Ads...</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-brand-border bg-brand-light p-8 text-center">
          <p className="text-sm text-brand-muted">אין נתוני Google Ads בתקופה זו.</p>
          <p className="mt-1 text-xs text-brand-muted">ודא שחשבון מחובר ונבחר, ולחץ &quot;סנכרן עכשיו&quot;</p>
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
                    } else if (col.key === "channelType") {
                      display = CHANNEL_LABELS[String(c.channelType)] ?? String(c.channelType);
                    } else if (col.type === "text") {
                      display = String(c[col.key] ?? "—");
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
                  if (col.key === "name") return <td key={col.key} className="px-3 py-2.5 text-brand-dark">סה&quot;כ</td>;
                  if (col.type === "text") return <td key={col.key} className="px-3 py-2.5" />;
                  const sum = campaigns.reduce((s, c) => s + Number(c[col.key] ?? 0), 0);
                  const avg = campaigns.length > 0 ? sum / campaigns.length : 0;
                  const val = ["ctr", "averageCpc", "averageCpm", "roas", "costPerConversion", "searchImprShare", "contentImprShare"].includes(col.key) ? avg : sum;
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
    </div>
  );
}
