"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import DateRangePicker, { DateRange, getPresetRange } from "./DateRangePicker";
import CampaignTrendTable from "./CampaignTrendTable";
import { getCurrencySymbol } from "@/lib/utils/currency";

interface Props {
  clientId: string;
  currency: string;
}

interface Campaign {
  [key: string]: string | number;
  id: string;
  name: string;
  objective: string;
  bidStrategy: string;
  dailyBudget: number;
  lifetimeBudget: number;
  spend: number;
  socialSpend: number;
  impressions: number;
  clicks: number;
  uniqueClicks: number;
  inlineLinkClicks: number;
  outboundClicks: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  linkClicks: number;
  landingPageViews: number;
  videoViews: number;
  videoThruplay: number;
  engagement: number;
  conversions: number;
  costPerConversion: number;
  purchases: number;
  purchaseValue: number;
  leads: number;
  costPerLead: number;
  roas: number;
  qualityRanking: string;
  engagementRanking: string;
  conversionRanking: string;
}

interface ApiResponse {
  currency: string;
  selectedEvent: string;
  campaigns: Campaign[];
}

type ColumnKey =
  | "name" | "objective" | "bidStrategy"
  | "spend" | "socialSpend" | "impressions" | "reach" | "frequency"
  | "clicks" | "uniqueClicks" | "inlineLinkClicks" | "outboundClicks"
  | "ctr" | "cpc" | "cpm"
  | "conversions" | "costPerConversion" | "roas"
  | "purchases" | "purchaseValue" | "leads" | "costPerLead"
  | "linkClicks" | "landingPageViews" | "videoViews" | "videoThruplay" | "engagement"
  | "qualityRanking" | "engagementRanking" | "conversionRanking"
  | "dailyBudget" | "lifetimeBudget";

type ColumnType = "text" | "money" | "number" | "percent" | "roas" | "frequency";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  type: ColumnType;
}

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "שם קמפיין (campaign_name)", type: "text" },
  { key: "objective", label: "מטרת קמפיין (objective)", type: "text" },
  { key: "spend", label: "הוצאה (spend)", type: "money" },
  { key: "socialSpend", label: "הוצאה חברתית (social_spend)", type: "money" },
  { key: "impressions", label: "הופעות (impressions)", type: "number" },
  { key: "reach", label: "חשיפה (reach)", type: "number" },
  { key: "frequency", label: "תדירות (frequency)", type: "frequency" },
  { key: "clicks", label: "קליקים הכל (clicks)", type: "number" },
  { key: "uniqueClicks", label: "קליקים ייחודיים (unique_clicks)", type: "number" },
  { key: "inlineLinkClicks", label: "קליקים על קישור (inline_link_clicks)", type: "number" },
  { key: "outboundClicks", label: "קליקים יוצאים (outbound_clicks)", type: "number" },
  { key: "ctr", label: "CTR הכל (ctr)", type: "percent" },
  { key: "cpc", label: "CPC הכל (cpc)", type: "money" },
  { key: "cpm", label: "CPM (cpm)", type: "money" },
  { key: "conversions", label: "המרות (actions)", type: "number" },
  { key: "costPerConversion", label: "CPA (cost_per_action)", type: "money" },
  { key: "roas", label: "ROAS", type: "roas" },
  { key: "purchases", label: "רכישות (purchase)", type: "number" },
  { key: "purchaseValue", label: "ערך רכישות (purchase_value)", type: "money" },
  { key: "leads", label: "לידים (lead)", type: "number" },
  { key: "costPerLead", label: "CPL (cost_per_lead)", type: "money" },
  { key: "linkClicks", label: "צפיות דף נחיתה (landing_page_view)", type: "number" },
  { key: "landingPageViews", label: "דפי נחיתה (landing_page_views)", type: "number" },
  { key: "videoViews", label: "צפיות וידאו (video_views)", type: "number" },
  { key: "videoThruplay", label: "Thruplay (video_thruplay)", type: "number" },
  { key: "engagement", label: "מעורבות פוסט (post_engagement)", type: "number" },
  { key: "qualityRanking", label: "דירוג איכות (quality_ranking)", type: "text" },
  { key: "engagementRanking", label: "דירוג מעורבות (engagement_rate_ranking)", type: "text" },
  { key: "conversionRanking", label: "דירוג המרות (conversion_rate_ranking)", type: "text" },
  { key: "bidStrategy", label: "אסטרטגיית הצעה (bid_strategy)", type: "text" },
  { key: "dailyBudget", label: "תקציב יומי (daily_budget)", type: "money" },
  { key: "lifetimeBudget", label: "תקציב כולל (lifetime_budget)", type: "money" },
];

const DEFAULT_VISIBLE: ColumnKey[] = [
  "name",
  "spend",
  "impressions",
  "clicks",
  "conversions",
  "costPerConversion",
  "roas",
];

function formatValue(value: number, type: ColumnType, currencySymbol: string): string {
  if (!Number.isFinite(value)) return "-";
  switch (type) {
    case "money":
      return `${currencySymbol}${Math.round(value).toLocaleString()}`;
    case "percent":
      return `${value.toFixed(2)}%`;
    case "roas":
      return value.toFixed(2);
    case "frequency":
      return value.toFixed(2);
    case "number":
      return Math.round(value).toLocaleString();
    default:
      return String(value);
  }
}

function MetaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z" />
    </svg>
  );
}

export default function MetaCampaignsTab({ clientId, currency }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this_month"));
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set<string>(DEFAULT_VISIBLE)
  );
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currencySymbol = getCurrencySymbol(data?.currency || currency);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const url = `/api/clients/${clientId}/meta-campaigns?since=${dateRange.since}&until=${dateRange.until}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json: ApiResponse = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [clientId, dateRange.since, dateRange.until]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setColumnsDropdownOpen(false);
      }
    }
    if (columnsDropdownOpen) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [columnsDropdownOpen]);

  const toggleColumn = (key: ColumnKey) => {
    if (key === "name") return;
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeColumns = useMemo(
    () => COLUMNS.filter((c) => visibleColumns.has(c.key)),
    [visibleColumns]
  );

  const sortedCampaigns = useMemo(() => {
    const campaigns = data?.campaigns || [];
    return [...campaigns].sort((a, b) => b.spend - a.spend);
  }, [data]);

  return (
    <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border p-4">
        <div className="flex items-center gap-2">
          <MetaIcon className="h-5 w-5 text-[#1877F2]" />
          <h3 className="text-base font-medium text-brand-dark">Meta Ads</h3>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setColumnsDropdownOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-brand-border px-3 py-1.5 text-xs text-brand-dark hover:bg-brand-bg"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>עמודות</span>
            </button>
            {columnsDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-lg border border-brand-border bg-brand-light p-3 shadow-lg max-h-80 overflow-y-auto">
                <div className="space-y-2">
                  {COLUMNS.map((col) => {
                    const checked = visibleColumns.has(col.key);
                    const locked = col.key === "name";
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 text-xs text-brand-dark ${
                          locked ? "opacity-60" : "cursor-pointer hover:text-brand-gold"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggleColumn(col.key)}
                          className="h-3.5 w-3.5 rounded border-brand-border"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-brand-muted">טוען...</div>
        ) : sortedCampaigns.length === 0 ? (
          <div className="p-8 text-center text-sm text-brand-muted">
            אין נתוני קמפיינים. הפעל סנכרון.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                {activeColumns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-right font-medium text-brand-muted bg-brand-bg/50 border-b border-brand-border whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCampaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-brand-border">
                  {activeColumns.map((col) => {
                    if (col.key === "name") {
                      return (
                        <td
                          key={col.key}
                          className="px-4 py-3 text-right text-brand-dark"
                        >
                          {campaign.name}
                        </td>
                      );
                    }
                    const rawValue = campaign[col.key] as number;
                    return (
                      <td
                        key={col.key}
                        className="px-4 py-3 text-right text-brand-dark whitespace-nowrap"
                      >
                        {formatValue(rawValue, col.type, currencySymbol)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CampaignTrendTable clientId={clientId} endpoint="meta-campaigns" currency={currency} />
    </div>
  );
}
