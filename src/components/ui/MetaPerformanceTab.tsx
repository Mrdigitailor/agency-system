"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import DateRangePicker, { getPresetRange, type DateRange } from "./DateRangePicker";
import { getCurrencySymbol } from "@/lib/utils/currency";
import { Plus, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  clientId: string;
  currency: string;
}

type MetricFormat = "money" | "number" | "percent" | "decimal";
type ChartType = "line" | "bar" | "area" | "kpi";
type Platform = "all" | "meta" | "google_ads";
type SectionWidth = "full" | "half" | "third";

interface MetricDef {
  id: string;
  label: string;
  format: MetricFormat;
  eventOverride?: string;
}

const META_METRICS: MetricDef[] = [
  { id: "spend", label: "הוצאה", format: "money" },
  { id: "impressions", label: "הופעות", format: "number" },
  { id: "reach", label: "חשיפה", format: "number" },
  { id: "clicks", label: "קליקים", format: "number" },
  { id: "link_clicks", label: "קליקי קישור", format: "number" },
  { id: "landing_page_views", label: "דפי נחיתה", format: "number" },
  { id: "video_views", label: "צפיות וידאו", format: "number" },
  { id: "engagement", label: "מעורבות", format: "number" },
  { id: "conversions", label: "המרות", format: "number" },
  { id: "cost_per_conversion", label: "עלות להמרה", format: "money" },
  { id: "ctr", label: "CTR %", format: "percent" },
  { id: "cpc", label: "CPC", format: "money" },
  { id: "cpm", label: "CPM", format: "money" },
  { id: "leads", label: "לידים", format: "number" },
  { id: "cost_per_lead", label: "CPL", format: "money" },
  { id: "purchases", label: "רכישות", format: "number" },
  { id: "purchase_value", label: "ערך רכישות", format: "money" },
  { id: "roas", label: "ROAS", format: "decimal" },
];

const GOOGLE_ADS_METRICS: MetricDef[] = [
  { id: "spend", label: "הוצאה", format: "money" },
  { id: "impressions", label: "הופעות", format: "number" },
  { id: "clicks", label: "קליקים", format: "number" },
  { id: "conversions", label: "המרות", format: "number" },
  { id: "conversionsValue", label: "ערך המרות", format: "money" },
  { id: "costPerConversion", label: "עלות להמרה", format: "money" },
  { id: "ctr", label: "CTR %", format: "percent" },
  { id: "averageCpc", label: "CPC ממוצע", format: "money" },
  { id: "averageCpm", label: "CPM ממוצע", format: "money" },
  { id: "videoViews", label: "צפיות וידאו", format: "number" },
];

const ALL_METRICS: MetricDef[] = [
  { id: "spend", label: "הוצאה", format: "money" },
  { id: "impressions", label: "הופעות", format: "number" },
  { id: "clicks", label: "קליקים", format: "number" },
  { id: "conversions", label: "המרות", format: "number" },
  { id: "cost_per_conversion", label: "עלות להמרה", format: "money" },
];

function getMetricsForPlatform(platform: Platform): MetricDef[] {
  switch (platform) {
    case "meta":
      return META_METRICS;
    case "google_ads":
      return GOOGLE_ADS_METRICS;
    case "all":
    default:
      return ALL_METRICS;
  }
}

function getMetricDef(id: string, platform: Platform): MetricDef {
  const metrics = getMetricsForPlatform(platform);
  return metrics.find((m) => m.id === id) ?? metrics[0];
}

interface SeriesPoint {
  date: string;
  value: number;
}

interface MultiSeriesPoint {
  date: string;
  [metricId: string]: string | number;
}

interface SectionConfig {
  metrics: string[];
  chartType: ChartType;
  platform: Platform;
  width: SectionWidth;
}

interface SectionState {
  id: number;
  metrics: string[];
  chartType: ChartType;
  platform: Platform;
  width: SectionWidth;
  range: DateRange;
  dataByMetric: Record<string, SeriesPoint[]>;
  loading: boolean;
}

const METRIC_COLORS = ["#eed89b", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b"];
const MAX_METRICS_PER_SECTION = 5;

const STORAGE_KEY_PREFIX = "perf-sections-";

function loadSavedConfig(clientId: string): SectionConfig[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + clientId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // migrate old format: single metric -> metrics array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return parsed.map((cfg: any) => ({
        metrics: Array.isArray(cfg.metrics) ? cfg.metrics as string[] : (cfg.metric ? [cfg.metric as string] : ["spend"]),
        chartType: (cfg.chartType ?? "line") as ChartType,
        platform: (cfg.platform ?? "all") as Platform,
        width: (cfg.width ?? "full") as SectionWidth,
      }));
    }
  } catch {
    // ignore
  }
  return null;
}

function saveConfig(clientId: string, sections: SectionState[]) {
  try {
    const configs: SectionConfig[] = sections.map((s) => ({
      metrics: s.metrics,
      chartType: s.chartType,
      platform: s.platform,
      width: s.width,
    }));
    localStorage.setItem(STORAGE_KEY_PREFIX + clientId, JSON.stringify(configs));
  } catch {
    // ignore
  }
}

const DEFAULT_CONFIGS: SectionConfig[] = [
  { metrics: ["spend"], chartType: "line", platform: "all", width: "full" },
  { metrics: ["conversions"], chartType: "line", platform: "all", width: "full" },
  { metrics: ["cost_per_conversion"], chartType: "kpi", platform: "all", width: "full" },
];

const MAX_SECTIONS = 8;

// --- format helpers (kept from original) ---

function formatValue(value: number, format: MetricFormat, currency: string): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  const symbol = getCurrencySymbol(currency);
  switch (format) {
    case "money":
      return `${symbol}${value.toLocaleString("he-IL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${value.toLocaleString("he-IL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}%`;
    case "decimal":
      return value.toLocaleString("he-IL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case "number":
    default:
      return value.toLocaleString("he-IL");
  }
}

function formatAxisValue(value: number, format: MetricFormat, currency: string): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  const symbol = getCurrencySymbol(currency);
  switch (format) {
    case "money":
      if (value >= 1000) return `${symbol}${(value / 1000).toFixed(1)}K`;
      return `${symbol}${value.toFixed(0)}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "decimal":
      return value.toFixed(2);
    case "number":
    default:
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toString();
  }
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

// --- merge two series arrays by date, summing values ---

function mergeSeries(a: SeriesPoint[], b: SeriesPoint[]): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const p of a) map.set(p.date, (map.get(p.date) ?? 0) + p.value);
  for (const p of b) map.set(p.date, (map.get(p.date) ?? 0) + p.value);
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

// --- merge multiple metric series into a single array with keyed values ---

function mergeMultiMetricData(
  dataByMetric: Record<string, SeriesPoint[]>,
  metrics: string[],
): MultiSeriesPoint[] {
  const dateMap = new Map<string, MultiSeriesPoint>();
  for (const metricId of metrics) {
    const series = dataByMetric[metricId] ?? [];
    for (const point of series) {
      if (!dateMap.has(point.date)) {
        dateMap.set(point.date, { date: point.date });
      }
      const entry = dateMap.get(point.date)!;
      entry[metricId] = point.value;
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

// --- width helpers ---

function getWidthClass(width: SectionWidth): string {
  switch (width) {
    case "half":
      return "w-[calc(50%-0.5rem)]";
    case "third":
      return "w-[calc(33.333%-0.67rem)]";
    case "full":
    default:
      return "w-full";
  }
}

// --- Multi-metric dropdown component ---

function MultiMetricDropdown({
  selectedMetrics,
  availableMetrics,
  onChange,
}: {
  selectedMetrics: string[];
  availableMetrics: MetricDef[];
  onChange: (metrics: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleMetric = (metricId: string) => {
    if (selectedMetrics.includes(metricId)) {
      // don't remove if it's the last one
      if (selectedMetrics.length <= 1) return;
      onChange(selectedMetrics.filter((m) => m !== metricId));
    } else {
      if (selectedMetrics.length >= MAX_METRICS_PER_SECTION) return;
      onChange([...selectedMetrics, metricId]);
    }
  };

  const selectedLabels = selectedMetrics
    .map((id) => availableMetrics.find((m) => m.id === id)?.label ?? id)
    .join(", ");

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-md border border-brand-border bg-white px-3 py-2 text-sm font-ploni focus:outline-none focus:ring-2 focus:ring-brand-primary text-right min-w-[140px] max-w-[240px] truncate flex items-center gap-1"
      >
        <span className="truncate">{selectedLabels}</span>
        <span className="text-xs text-brand-muted mr-1">({selectedMetrics.length})</span>
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-brand-border rounded-lg shadow-lg max-h-[280px] overflow-y-auto min-w-[200px]">
          {availableMetrics.map((m) => {
            const isSelected = selectedMetrics.includes(m.id);
            const isDisabled = !isSelected && selectedMetrics.length >= MAX_METRICS_PER_SECTION;
            return (
              <label
                key={m.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-ploni cursor-pointer hover:bg-gray-50 transition-colors ${
                  isDisabled ? "opacity-40 cursor-not-allowed" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => toggleMetric(m.id)}
                  className="rounded border-brand-border text-brand-primary focus:ring-brand-primary accent-[#eed89b]"
                />
                <span>{m.label}</span>
              </label>
            );
          })}
          {selectedMetrics.length >= MAX_METRICS_PER_SECTION && (
            <div className="px-3 py-1.5 text-xs text-brand-muted border-t border-brand-border">
              מקסימום {MAX_METRICS_PER_SECTION} מדדים
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Width toggle component ---

function WidthToggle({
  width,
  onChange,
}: {
  width: SectionWidth;
  onChange: (w: SectionWidth) => void;
}) {
  const options: { value: SectionWidth; icon: string; title: string }[] = [
    { value: "full", icon: "\u25AC", title: "רוחב מלא" },
    { value: "half", icon: "\u258C\u258C", title: "חצי רוחב" },
    { value: "third", icon: "\u258C\u258C\u258C", title: "שליש רוחב" },
  ];

  return (
    <div className="flex items-center border border-brand-border rounded-md overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.title}
          className={`px-2 py-1.5 text-xs font-ploni transition-colors duration-200 ${
            width === opt.value
              ? "bg-brand-primary text-brand-dark"
              : "bg-white text-brand-muted hover:bg-gray-50"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

// --- main component ---

export default function MetaPerformanceTab({ clientId, currency }: Props) {
  const nextIdRef = useRef(4);

  const buildInitialSections = useCallback((): SectionState[] => {
    const saved = loadSavedConfig(clientId);
    const configs = saved ?? DEFAULT_CONFIGS;
    return configs.map((cfg, i) => ({
      id: i + 1,
      metrics: cfg.metrics,
      chartType: cfg.chartType,
      platform: cfg.platform,
      width: cfg.width ?? "full",
      range: getPresetRange("this_month"),
      dataByMetric: {},
      loading: false,
    }));
  }, [clientId]);

  const [sections, setSections] = useState<SectionState[]>(buildInitialSections);

  // persist config whenever sections change
  useEffect(() => {
    saveConfig(clientId, sections);
  }, [clientId, sections]);

  const fetchTimeseries = useCallback(
    async (
      platform: "meta" | "google_ads",
      metric: string,
      range: DateRange,
      eventOverride?: string,
    ): Promise<SeriesPoint[]> => {
      const baseUrl =
        platform === "meta"
          ? `/api/clients/${clientId}/meta-timeseries`
          : `/api/clients/${clientId}/google-timeseries`;
      const params = new URLSearchParams({
        metric,
        since: range.since,
        until: range.until,
      });
      if (eventOverride) params.set("event", eventOverride);
      const res = await fetch(`${baseUrl}?${params.toString()}`);
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      return Array.isArray(json.series) ? json.series : [];
    },
    [clientId],
  );

  const fetchSingleMetric = useCallback(
    async (metric: string, range: DateRange, platform: Platform): Promise<SeriesPoint[]> => {
      const metricDef = getMetricDef(metric, platform);
      if (platform === "all") {
        const [metaSeries, googleSeries] = await Promise.allSettled([
          fetchTimeseries("meta", metric, range, metricDef.eventOverride),
          fetchTimeseries("google_ads", metric, range, metricDef.eventOverride),
        ]);
        const metaData = metaSeries.status === "fulfilled" ? metaSeries.value : [];
        const googleData = googleSeries.status === "fulfilled" ? googleSeries.value : [];
        return mergeSeries(metaData, googleData);
      } else {
        return await fetchTimeseries(platform, metric, range, metricDef.eventOverride);
      }
    },
    [fetchTimeseries],
  );

  const fetchSection = useCallback(
    async (sectionId: number, metrics: string[], range: DateRange, platform: Platform) => {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, loading: true } : s)),
      );
      try {
        const results = await Promise.all(
          metrics.map(async (metric) => {
            const series = await fetchSingleMetric(metric, range, platform);
            return { metric, series };
          }),
        );
        const dataByMetric: Record<string, SeriesPoint[]> = {};
        for (const r of results) {
          dataByMetric[r.metric] = r.series;
        }
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, dataByMetric, loading: false } : s,
          ),
        );
      } catch {
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, dataByMetric: {}, loading: false } : s,
          ),
        );
      }
    },
    [fetchSingleMetric],
  );

  // initial fetch
  useEffect(() => {
    const initial = buildInitialSections();
    setSections(initial);
    nextIdRef.current = initial.length + 1;
    initial.forEach((s) => {
      fetchSection(s.id, s.metrics, s.range, s.platform);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleMetricsChange = (sectionId: number, metrics: string[]) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, metrics } : s)),
    );
    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      fetchSection(sectionId, metrics, section.range, section.platform);
    }
  };

  const handleChartTypeChange = (sectionId: number, chartType: ChartType) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, chartType } : s)),
    );
  };

  const handleWidthChange = (sectionId: number, width: SectionWidth) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, width } : s)),
    );
  };

  const handlePlatformChange = (sectionId: number, platform: Platform) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const newAvailable = getMetricsForPlatform(platform);
    // filter selected metrics to only those available in new platform
    const validMetrics = section.metrics.filter((m) =>
      newAvailable.some((am) => am.id === m),
    );
    const finalMetrics = validMetrics.length > 0 ? validMetrics : [newAvailable[0].id];
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, platform, metrics: finalMetrics } : s,
      ),
    );
    fetchSection(sectionId, finalMetrics, section.range, platform);
  };

  const handleRangeChange = (sectionId: number, range: DateRange) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, range } : s)),
    );
    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      fetchSection(sectionId, section.metrics, range, section.platform);
    }
  };

  const addSection = () => {
    if (sections.length >= MAX_SECTIONS) return;
    const id = nextIdRef.current++;
    const newSection: SectionState = {
      id,
      metrics: ["spend"],
      chartType: "line",
      platform: "all",
      width: "full",
      range: getPresetRange("this_month"),
      dataByMetric: {},
      loading: false,
    };
    setSections((prev) => [...prev, newSection]);
    fetchSection(id, newSection.metrics, newSection.range, newSection.platform);
  };

  const removeSection = (sectionId: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
    { value: "line", label: "קו" },
    { value: "bar", label: "עמודות" },
    { value: "area", label: "שטח" },
    { value: "kpi", label: "KPI" },
  ];

  const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
    { value: "all", label: "הכל" },
    { value: "meta", label: "Meta" },
    { value: "google_ads", label: "Google Ads" },
  ];

  return (
    <div dir="rtl" className="flex flex-wrap gap-4">
      {sections.map((section) => {
        const availableMetrics = getMetricsForPlatform(section.platform);
        const hasData = section.metrics.some(
          (m) => (section.dataByMetric[m]?.length ?? 0) > 0,
        );

        return (
          <div
            key={section.id}
            className={`rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm ${getWidthClass(section.width)}`}
          >
            {/* section header */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {/* platform selector */}
              <select
                value={section.platform}
                onChange={(e) =>
                  handlePlatformChange(section.id, e.target.value as Platform)
                }
                className="rounded-md border border-brand-border bg-white px-3 py-2 text-sm font-ploni focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* multi-metric selector */}
              <MultiMetricDropdown
                selectedMetrics={section.metrics}
                availableMetrics={availableMetrics}
                onChange={(metrics) => handleMetricsChange(section.id, metrics)}
              />

              {/* chart type selector */}
              <select
                value={section.chartType}
                onChange={(e) =>
                  handleChartTypeChange(section.id, e.target.value as ChartType)
                }
                className="rounded-md border border-brand-border bg-white px-3 py-2 text-sm font-ploni focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                {CHART_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* date range picker */}
              <DateRangePicker
                value={section.range}
                onChange={(r) => handleRangeChange(section.id, r)}
              />

              {/* width toggle */}
              <WidthToggle
                width={section.width}
                onChange={(w) => handleWidthChange(section.id, w)}
              />

              {/* spacer */}
              <div className="flex-1" />

              {/* remove button */}
              {sections.length > 1 && (
                <button
                  onClick={() => removeSection(section.id)}
                  className="rounded-md p-1.5 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors duration-200"
                  title="הסר חלק"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* chart / kpi area */}
            <div className={section.chartType === "kpi" ? "min-h-[140px] w-full" : "h-[260px] w-full"}>
              {section.loading ? (
                <div className="flex h-full items-center justify-center text-sm text-brand-muted font-ploni">
                  טוען...
                </div>
              ) : !hasData ? (
                <div className="flex h-full items-center justify-center text-sm text-brand-muted font-ploni">
                  אין נתונים לטווח זה.
                </div>
              ) : section.chartType === "kpi" ? (
                <MultiKpiCards
                  dataByMetric={section.dataByMetric}
                  metrics={section.metrics}
                  platform={section.platform}
                  currency={currency}
                />
              ) : (
                <MultiChartRenderer
                  chartType={section.chartType}
                  dataByMetric={section.dataByMetric}
                  metrics={section.metrics}
                  platform={section.platform}
                  currency={currency}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* add section button */}
      {sections.length < MAX_SECTIONS && (
        <button
          onClick={addSection}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand-border bg-brand-light p-3 text-sm font-ploni text-brand-muted hover:border-brand-gold hover:text-brand-dark transition-colors duration-200"
        >
          <Plus size={16} />
          הוסף גרף
        </button>
      )}
    </div>
  );
}

// --- Multi KPI cards ---

function MultiKpiCards({
  dataByMetric,
  metrics,
  platform,
  currency,
}: {
  dataByMetric: Record<string, SeriesPoint[]>;
  metrics: string[];
  platform: Platform;
  currency: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 h-full">
      {metrics.map((metricId, idx) => {
        const metricDef = getMetricDef(metricId, platform);
        const data = dataByMetric[metricId] ?? [];
        if (data.length === 0) return null;
        const total = data.reduce((sum, p) => sum + p.value, 0);
        const isRate =
          ["percent", "decimal"].includes(metricDef.format) ||
          metricDef.id.includes("cost_per") ||
          metricDef.id.includes("cpc") ||
          metricDef.id.includes("cpm") ||
          metricDef.id.includes("averageCpc") ||
          metricDef.id.includes("averageCpm") ||
          metricDef.id.includes("costPerConversion");
        const displayValue = isRate ? total / data.length : total;

        return (
          <div
            key={metricId}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-brand-border bg-white p-4 min-w-[160px] flex-1"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: METRIC_COLORS[idx % METRIC_COLORS.length] }}
              />
              <span className="text-sm font-ploni text-brand-muted">{metricDef.label}</span>
            </div>
            <span className="text-3xl font-ploni font-semibold text-brand-dark">
              {formatValue(displayValue, metricDef.format, currency)}
            </span>
            <span className="text-xs font-ploni text-brand-muted">
              {data.length} ימים
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Multi Chart renderer ---

function MultiChartRenderer({
  chartType,
  dataByMetric,
  metrics,
  platform,
  currency,
}: {
  chartType: "line" | "bar" | "area";
  dataByMetric: Record<string, SeriesPoint[]>;
  metrics: string[];
  platform: Platform;
  currency: string;
}) {
  const mergedData = mergeMultiMetricData(dataByMetric, metrics);
  // Use first metric's format for axis formatting
  const primaryDef = getMetricDef(metrics[0], platform);

  const commonXAxis = (
    <XAxis
      dataKey="date"
      tickFormatter={formatDateShort}
      stroke="#666666"
      tick={{ fontSize: 12, fontFamily: "Ploni" }}
      reversed
    />
  );

  const commonYAxis = (
    <YAxis
      tickFormatter={(v: number) => formatAxisValue(v, primaryDef.format, currency)}
      stroke="#666666"
      tick={{ fontSize: 12, fontFamily: "Ploni" }}
      orientation="right"
    />
  );

  const commonTooltip = (
    <Tooltip
      formatter={(value: unknown, name: unknown) => {
        const def = getMetricDef(String(name ?? ""), platform);
        return [
          formatValue(Number(value) || 0, def.format, currency),
          def.label,
        ] as [string, string];
      }}
      labelFormatter={(label: unknown) => formatDateShort(String(label))}
      contentStyle={{
        direction: "rtl",
        fontFamily: "Ploni",
        borderRadius: "8px",
        border: "1px solid #e0e0e0",
      }}
    />
  );

  const commonGrid = <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />;
  const margin = { top: 10, right: 10, left: 10, bottom: 10 };

  const legendFormatter = (value: string) => {
    const def = getMetricDef(value, platform);
    return def.label;
  };

  const showLegend = metrics.length > 1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === "bar" ? (
        <BarChart data={mergedData} margin={margin}>
          {commonGrid}
          {commonXAxis}
          {commonYAxis}
          {commonTooltip}
          {showLegend && (
            <Legend
              formatter={legendFormatter}
              wrapperStyle={{ fontFamily: "Ploni", fontSize: "12px" }}
            />
          )}
          {metrics.map((metricId, idx) => (
            <Bar
              key={metricId}
              dataKey={metricId}
              fill={METRIC_COLORS[idx % METRIC_COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      ) : chartType === "area" ? (
        <AreaChart data={mergedData} margin={margin}>
          {commonGrid}
          {commonXAxis}
          {commonYAxis}
          {commonTooltip}
          {showLegend && (
            <Legend
              formatter={legendFormatter}
              wrapperStyle={{ fontFamily: "Ploni", fontSize: "12px" }}
            />
          )}
          {metrics.map((metricId, idx) => (
            <Area
              key={metricId}
              type="monotone"
              dataKey={metricId}
              stroke={METRIC_COLORS[idx % METRIC_COLORS.length]}
              strokeWidth={2}
              fill={METRIC_COLORS[idx % METRIC_COLORS.length]}
              fillOpacity={0.15}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={mergedData} margin={margin}>
          {commonGrid}
          {commonXAxis}
          {commonYAxis}
          {commonTooltip}
          {showLegend && (
            <Legend
              formatter={legendFormatter}
              wrapperStyle={{ fontFamily: "Ploni", fontSize: "12px" }}
            />
          )}
          {metrics.map((metricId, idx) => (
            <Line
              key={metricId}
              type="monotone"
              dataKey={metricId}
              stroke={METRIC_COLORS[idx % METRIC_COLORS.length]}
              strokeWidth={2}
              dot={{ fill: METRIC_COLORS[idx % METRIC_COLORS.length], r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
