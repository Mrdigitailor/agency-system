"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, BarChart3, Image as ImageIcon } from "lucide-react";
import Modal from "@/components/ui/Modal";
import DateRangePicker, { DateRange, getPresetRange } from "./DateRangePicker";
import { getCurrencySymbol } from "@/lib/utils/currency";
import { useLanguage } from "@/lib/i18n/LanguageContext";

/* ───────── Types ───────── */

interface VideoAction {
  action_type: string;
  value: string;
}

interface CreativeInsights {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inline_link_clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  cost_per_conversion: number;
  video_p25_watched_actions?: VideoAction[];
  video_p50_watched_actions?: VideoAction[];
  video_p75_watched_actions?: VideoAction[];
  video_p100_watched_actions?: VideoAction[];
}

interface Creative {
  id: string;
  adId: string;
  adName: string;
  creativeName: string;
  status: string;
  body: string;
  title: string;
  linkUrl: string;
  ctaType: string;
  imageUrl: string;
  videoId: string;
  videoUrl: string;
  thumbnailUrl: string;
  previewHtml: string;
  campaignName: string;
  adsetName: string;
  insights: CreativeInsights;
}

interface Props {
  clientId: string;
  currency: string;
}

type SortField = "spend" | "conversions" | "cpa" | "ctr";
type SortDir = "desc" | "asc";

/* ───────── Helpers ───────── */

function fmtMoney(val: number, sym: string): string {
  if (!Number.isFinite(val)) return "-";
  return `${sym}${Math.round(val).toLocaleString("he-IL")}`;
}

function fmtPercent(val: number): string {
  if (!Number.isFinite(val)) return "-";
  return `${val.toFixed(2)}%`;
}

function fmtNumber(val: number): string {
  if (!Number.isFinite(val)) return "-";
  return Math.round(val).toLocaleString("he-IL");
}

function getVideoValue(actions?: VideoAction[]): number {
  if (!actions || actions.length === 0) return 0;
  return Number(actions[0].value) || 0;
}

function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "ACTIVE":
      return t('active');
    case "PAUSED":
      return t('paused');
    default:
      return status;
  }
}

function statusClasses(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-700";
    case "PAUSED":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function getSortValue(c: Creative, field: SortField): number {
  switch (field) {
    case "spend":
      return c.insights.spend ?? 0;
    case "conversions":
      return c.insights.conversions ?? 0;
    case "cpa":
      return c.insights.cost_per_conversion ?? 0;
    case "ctr":
      return c.insights.ctr ?? 0;
  }
}

/* ───────── Component ───────── */

export default function CreativesTab({ clientId, currency }: Props) {
  const { t } = useLanguage();
  const sym = getCurrencySymbol(currency);

  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this_month"));

  // Filters & sort
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Detail modal
  const [detailCreative, setDetailCreative] = useState<Creative | null>(null);

  // Compare mode
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const inputClass =
    "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold transition-colors duration-200";

  /* ── Fetch ── */

  const fetchCreatives = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}/creatives?since=${dateRange.since}&until=${dateRange.until}`);
      if (!res.ok) throw new Error("שגיאה בטעינת קריאייטיבים");
      const data = await res.json();
      setCreatives(data.creatives ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  }, [clientId, dateRange.since, dateRange.until]);

  useEffect(() => {
    fetchCreatives();
  }, [fetchCreatives]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/creatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: dateRange.since, until: dateRange.until }),
      });
      if (!res.ok) throw new Error("שגיאה בסנכרון");
      await fetchCreatives();
    } catch {
      setError("שגיאה בסנכרון קריאייטיבים");
    } finally {
      setSyncing(false);
    }
  };

  /* ── Derived data ── */

  const campaigns = useMemo(() => {
    const set = new Set<string>();
    creatives.forEach((c) => {
      if (c.campaignName) set.add(c.campaignName);
    });
    return Array.from(set).sort();
  }, [creatives]);

  const filtered = useMemo(() => {
    let list = [...creatives];

    if (statusFilter !== "all") {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (campaignFilter !== "all") {
      list = list.filter((c) => c.campaignName === campaignFilter);
    }

    list.sort((a, b) => {
      const va = getSortValue(a, sortField);
      const vb = getSortValue(b, sortField);
      return sortDir === "desc" ? vb - va : va - vb;
    });

    return list;
  }, [creatives, statusFilter, campaignFilter, sortField, sortDir]);

  /* ── Compare ── */

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      }
      return next;
    });
  };

  const compareCreatives = useMemo(
    () => creatives.filter((c) => compareIds.has(c.id)),
    [creatives, compareIds]
  );

  /* ── Has video data ── */

  const hasVideo = (c: Creative) =>
    !!(
      c.insights.video_p25_watched_actions?.length ||
      c.insights.video_p50_watched_actions?.length ||
      c.insights.video_p75_watched_actions?.length ||
      c.insights.video_p100_watched_actions?.length
    );

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-brand-muted" />
        <span className="mr-2 text-brand-muted">טוען קריאייטיבים...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? t('syncing') : t('syncCreatives')}
        </button>

        {compareIds.size >= 2 && (
          <button
            onClick={() => setShowCompare(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-gold bg-brand-light px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/10"
          >
            <BarChart3 className="h-4 w-4" />
            {t('comparison')} ({compareIds.size})
          </button>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* סטטוס */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass}
        >
          <option value="all">{t('allStatuses')}</option>
          <option value="ACTIVE">{t('active')}</option>
          <option value="PAUSED">{t('paused')}</option>
        </select>

        {/* קמפיין */}
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className={inputClass}
        >
          <option value="all">{t('all')} {t('campaigns')}</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* מיון לפי */}
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          className={inputClass}
        >
          <option value="spend">{t('spend')}</option>
          <option value="conversions">{t('conversions')}</option>
          <option value="cpa">{t('costPerConversion')}</option>
          <option value="ctr">CTR</option>
        </select>

        {/* כיוון מיון */}
        <select
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value as SortDir)}
          className={inputClass}
        >
          <option value="desc">{t('highToLow')}</option>
          <option value="asc">{t('lowToHigh')}</option>
        </select>
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-brand-muted">
          {t('noCreatives')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="group relative cursor-pointer rounded-lg border border-brand-border bg-brand-light shadow-sm overflow-hidden transition-shadow duration-200 hover:shadow-md"
              onClick={() => setDetailCreative(c)}
            >
              {/* Compare checkbox */}
              <div
                className="absolute top-2 left-2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={compareIds.has(c.id)}
                  onChange={() => toggleCompare(c.id)}
                  disabled={!compareIds.has(c.id) && compareIds.size >= 4}
                  className="h-4 w-4 rounded border-brand-border accent-brand-gold"
                />
              </div>

              {/* Thumbnail */}
              <div className="relative h-44 w-full bg-brand-bg">
                {c.thumbnailUrl || c.imageUrl ? (
                  <img
                    src={c.thumbnailUrl || c.imageUrl}
                    alt={c.adName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-brand-muted/40" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-3 space-y-2">
                {/* Name + status */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-brand-dark line-clamp-1">
                    {c.adName || c.creativeName || "ללא שם"}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(c.status)}`}
                  >
                    {statusLabel(c.status, t)}
                  </span>
                </div>

                {/* Body */}
                {c.body && (
                  <p className="text-xs text-brand-muted line-clamp-2">
                    {c.body}
                  </p>
                )}

                {/* KPIs */}
                <div className="grid grid-cols-4 gap-1 border-t border-brand-border pt-2">
                  <KpiCell label={t('spend')} value={fmtMoney(c.insights.spend, sym)} />
                  <KpiCell label={t('conversions')} value={fmtNumber(c.insights.conversions)} />
                  <KpiCell
                    label={t('costPerConversion')}
                    value={fmtMoney(c.insights.cost_per_conversion, sym)}
                  />
                  <KpiCell label="CTR" value={fmtPercent(c.insights.ctr)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Detail Modal ── */}
      <Modal
        isOpen={!!detailCreative}
        onClose={() => setDetailCreative(null)}
        title={detailCreative?.adName || "פרטי קריאייטיב"}
        size="lg"
      >
        {detailCreative && (
          <DetailContent creative={detailCreative} sym={sym} />
        )}
      </Modal>

      {/* ── Compare Modal ── */}
      <Modal
        isOpen={showCompare}
        onClose={() => setShowCompare(false)}
        title={t('comparison')}
        size="lg"
      >
        <CompareTable creatives={compareCreatives} sym={sym} />
      </Modal>
    </div>
  );
}

/* ───────── Sub-components ───────── */

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-brand-muted">{label}</div>
      <div className="text-xs font-semibold text-brand-dark">{value}</div>
    </div>
  );
}

/* ── Detail modal content ── */

function DetailContent({ creative: c, sym }: { creative: Creative; sym: string }) {
  const { t } = useLanguage();
  const isVideo = !!(
    c.insights.video_p25_watched_actions?.length ||
    c.insights.video_p50_watched_actions?.length ||
    c.insights.video_p75_watched_actions?.length ||
    c.insights.video_p100_watched_actions?.length
  );

  return (
    <div className="space-y-4">
      {/* Thumbnail */}
      {(c.thumbnailUrl || c.imageUrl) && (
        <img
          src={c.thumbnailUrl || c.imageUrl}
          alt={c.adName}
          className="w-full max-h-64 rounded-lg object-contain bg-brand-bg"
        />
      )}

      {/* Text details */}
      <div className="space-y-2">
        {c.title && (
          <div>
            <span className="text-xs text-brand-muted">{t('headline')}:</span>
            <p className="text-sm font-medium text-brand-dark">{c.title}</p>
          </div>
        )}
        {c.body && (
          <div>
            <span className="text-xs text-brand-muted">{t('adText')}:</span>
            <p className="text-sm text-brand-dark whitespace-pre-line">{c.body}</p>
          </div>
        )}
        {c.ctaType && (
          <div>
            <span className="text-xs text-brand-muted">CTA:</span>
            <span className="mr-2 inline-block rounded-md bg-brand-gold px-2 py-0.5 text-xs font-medium text-brand-dark">
              {c.ctaType}
            </span>
          </div>
        )}
        {c.linkUrl && (
          <div>
            <span className="text-xs text-brand-muted">{t('destinationLink')}:</span>
            <a
              href={c.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-2 text-sm text-blue-600 underline break-all"
            >
              {c.linkUrl}
            </a>
          </div>
        )}
        {c.campaignName && (
          <div>
            <span className="text-xs text-brand-muted">{t('campaign')}:</span>
            <span className="mr-2 text-sm text-brand-dark">{c.campaignName}</span>
          </div>
        )}
        {c.adsetName && (
          <div>
            <span className="text-xs text-brand-muted">{t('adSet')}:</span>
            <span className="mr-2 text-sm text-brand-dark">{c.adsetName}</span>
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-brand-dark">{t('metrics')}</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard label={t('spend')} value={fmtMoney(c.insights.spend, sym)} />
          <MetricCard label={t('impressions')} value={fmtNumber(c.insights.impressions)} />
          <MetricCard label={t('reach')} value={fmtNumber(c.insights.reach)} />
          <MetricCard label={t('clicks')} value={fmtNumber(c.insights.clicks)} />
          <MetricCard label={t('linkClicks')} value={fmtNumber(c.insights.inline_link_clicks)} />
          <MetricCard label="CTR" value={fmtPercent(c.insights.ctr)} />
          <MetricCard label="CPC" value={fmtMoney(c.insights.cpc, sym)} />
          <MetricCard label="CPM" value={fmtMoney(c.insights.cpm, sym)} />
          <MetricCard label={t('conversions')} value={fmtNumber(c.insights.conversions)} />
          <MetricCard label={t('costPerConversion')} value={fmtMoney(c.insights.cost_per_conversion, sym)} />
        </div>
      </div>

      {/* Video funnel */}
      {isVideo && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-brand-dark">
            {t('videoFunnel')}
          </h4>
          <VideoFunnel insights={c.insights} />
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg p-2 text-center">
      <div className="text-[10px] text-brand-muted">{label}</div>
      <div className="text-sm font-semibold text-brand-dark">{value}</div>
    </div>
  );
}

/* ── Video funnel bars ── */

function VideoFunnel({ insights }: { insights: CreativeInsights }) {
  const p25 = getVideoValue(insights.video_p25_watched_actions);
  const p50 = getVideoValue(insights.video_p50_watched_actions);
  const p75 = getVideoValue(insights.video_p75_watched_actions);
  const p100 = getVideoValue(insights.video_p100_watched_actions);

  const max = Math.max(p25, p50, p75, p100, 1);

  const bars = [
    { label: "25%", value: p25, color: "bg-blue-400" },
    { label: "50%", value: p50, color: "bg-blue-500" },
    { label: "75%", value: p75, color: "bg-blue-600" },
    { label: "100%", value: p100, color: "bg-blue-700" },
  ];

  return (
    <div className="space-y-2">
      {bars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-xs font-medium text-brand-muted text-left">
            {bar.label}
          </span>
          <div className="flex-1 h-5 rounded-full bg-brand-bg overflow-hidden">
            <div
              className={`h-full rounded-full ${bar.color} transition-all duration-500`}
              style={{ width: `${(bar.value / max) * 100}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-xs font-semibold text-brand-dark text-right">
            {bar.value.toLocaleString("he-IL")}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Compare table ── */

function CompareTable({
  creatives,
  sym,
}: {
  creatives: Creative[];
  sym: string;
}) {
  const { t } = useLanguage();

  if (creatives.length === 0) {
    return (
      <p className="text-center text-brand-muted">{t('noCreatives')}</p>
    );
  }

  const rows: { label: string; getValue: (c: Creative) => string }[] = [
    { label: t('status'), getValue: (c) => statusLabel(c.status, t) },
    { label: t('campaign'), getValue: (c) => c.campaignName || "-" },
    { label: t('spend'), getValue: (c) => fmtMoney(c.insights.spend, sym) },
    { label: t('impressions'), getValue: (c) => fmtNumber(c.insights.impressions) },
    { label: t('reach'), getValue: (c) => fmtNumber(c.insights.reach) },
    { label: t('clicks'), getValue: (c) => fmtNumber(c.insights.clicks) },
    { label: "CTR", getValue: (c) => fmtPercent(c.insights.ctr) },
    { label: "CPC", getValue: (c) => fmtMoney(c.insights.cpc, sym) },
    { label: "CPM", getValue: (c) => fmtMoney(c.insights.cpm, sym) },
    { label: t('conversions'), getValue: (c) => fmtNumber(c.insights.conversions) },
    {
      label: t('costPerConversion'),
      getValue: (c) => fmtMoney(c.insights.cost_per_conversion, sym),
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-border">
            <th className="px-3 py-2 text-right text-xs font-medium text-brand-muted">
              {t('metric')}
            </th>
            {creatives.map((c) => (
              <th
                key={c.id}
                className="px-3 py-2 text-center text-xs font-semibold text-brand-dark"
              >
                <div className="line-clamp-2">{c.adName || c.creativeName}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="border-b border-brand-border last:border-0"
            >
              <td className="px-3 py-2 text-right text-xs font-medium text-brand-muted whitespace-nowrap">
                {row.label}
              </td>
              {creatives.map((c) => (
                <td
                  key={c.id}
                  className="px-3 py-2 text-center text-xs text-brand-dark"
                >
                  {row.getValue(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
