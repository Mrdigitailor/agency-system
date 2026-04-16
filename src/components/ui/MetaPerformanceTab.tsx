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
} from "recharts";
import DateRangePicker, { getPresetRange, type DateRange } from "./DateRangePicker";
import { getCurrencySymbol } from "@/lib/utils/currency";
import { Plus, X } from "lucide-react";

interface Props {
  clientId: string;
  currency: string;
}

type MetricFormat = "money" | "number" | "percent" | "decimal";
type ChartType = "line" | "bar" | "area" | "kpi";
type Platform = "all" | "meta" | "google_ads";

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

interface SectionConfig {
  metric: string;
  chartType: ChartType;
  platform: Platform;
}

interface SectionState {
  id: number;
  metric: string;
  chartType: ChartType;
  platform: Platform;
  range: DateRange;
  data: SeriesPoint[];
  loading: boolean;
}

const STORAGE_KEY_PREFIX = "perf-sections-";

function loadSavedConfig(clientId: string): SectionConfig[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + clientId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function saveConfig(clientId: string, sections: SectionState[]) {
  try {
    const configs: SectionConfig[] = sections.map((s) => ({
      metric: s.metric,
      chartType: s.chartType,
      platform: s.platform,
    }));
    localStorage.setItem(STORAGE_KEY_PREFIX + clientId, JSON.stringify(configs));
  } catch {
    // ignore
  }
}

const DEFAULT_CONFIGS: SectionConfig[] = [
  { metric: "spend", chartType: "line", platform: "all" },
  { metric: "conversions", chartType: "line", platform: "all" },
  { metric: "cost_per_conversion", chartType: "kpi", platform: "all" },
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

// --- main component ---

export default function MetaPerformanceTab({ clientId, currency }: Props) {
  const nextIdRef = useRef(4);

  const buildInitialSections = useCallback((): SectionState[] => {
    const saved = loadSavedConfig(clientId);
    const configs = saved ?? DEFAULT_CONFIGS;
    return configs.map((cfg, i) => ({
      id: i + 1,
      metric: cfg.metric,
      chartType: cfg.chartType,
      platform: cfg.platform,
      range: getPresetRange("this_month"),
      data: [],
      loading: false,
    }));
  }, [clientId]);

  const [sections, setSections] = useState<SectionState[]>(buildInitialSections);

  // persist config whenever sections change (metric/chartType/platform)
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

  const fetchSection = useCallback(
    async (sectionId: number, metric: string, range: DateRange, platform: Platform) => {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, loading: true } : s)),
      );
      try {
        const metricDef = getMetricDef(metric, platform);
        let series: SeriesPoint[];

        if (platform === "all") {
          // fetch both and merge
          const [metaSeries, googleSeries] = await Promise.allSettled([
            fetchTimeseries("meta", metric, range, metricDef.eventOverride),
            fetchTimeseries("google_ads", metric, range, metricDef.eventOverride),
          ]);
          const metaData = metaSeries.status === "fulfilled" ? metaSeries.value : [];
          const googleData = googleSeries.status === "fulfilled" ? googleSeries.value : [];
          series = mergeSeries(metaData, googleData);
        } else {
          series = await fetchTimeseries(platform, metric, range, metricDef.eventOverride);
        }

        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, data: series, loading: false } : s,
          ),
        );
      } catch {
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, data: [], loading: false } : s,
          ),
        );
      }
    },
    [fetchTimeseries],
  );

  // initial fetch
  useEffect(() => {
    const initial = buildInitialSections();
    setSections(initial);
    nextIdRef.current = initial.length + 1;
    initial.forEach((s) => {
      fetchSection(s.id, s.metric, s.range, s.platform);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleMetricChange = (sectionId: number, metric: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, metric } : s)),
    );
    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      fetchSection(sectionId, metric, section.range, section.platform);
    }
  };

  const handleChartTypeChange = (sectionId: number, chartType: ChartType) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, chartType } : s)),
    );
  };

  const handlePlatformChange = (sectionId: number, platform: Platform) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    // check if current metric exists in new platform; if not, pick first
    const newMetrics = getMetricsForPlatform(platform);
    const metricExists = newMetrics.some((m) => m.id === section.metric);
    const newMetric = metricExists ? section.metric : newMetrics[0].id;
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, platform, metric: newMetric } : s,
      ),
    );
    fetchSection(sectionId, newMetric, section.range, platform);
  };

  const handleRangeChange = (sectionId: number, range: DateRange) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, range } : s)),
    );
    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      fetchSection(sectionId, section.metric, range, section.platform);
    }
  };

  const addSection = () => {
    if (sections.length >= MAX_SECTIONS) return;
    const id = nextIdRef.current++;
    const newSection: SectionState = {
      id,
      metric: "spend",
      chartType: "line",
      platform: "all",
      range: getPresetRange("this_month"),
      data: [],
      loading: false,
    };
    setSections((prev) => [...prev, newSection]);
    fetchSection(id, newSection.metric, newSection.range, newSection.platform);
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
    <div dir="rtl" className="flex flex-col gap-4">
      {sections.map((section) => {
        const metricDef = getMetricDef(section.metric, section.platform);
        const availableMetrics = getMetricsForPlatform(section.platform);

        return (
          <div
            key={section.id}
            className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm"
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

              {/* metric selector */}
              <select
                value={section.metric}
                onChange={(e) => handleMetricChange(section.id, e.target.value)}
                className="rounded-md border border-brand-border bg-white px-3 py-2 text-sm font-ploni focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                {availableMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>

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
            <div className={section.chartType === "kpi" ? "h-[140px] w-full" : "h-[260px] w-full"}>
              {section.loading ? (
                <div className="flex h-full items-center justify-center text-sm text-brand-muted font-ploni">
                  טוען...
                </div>
              ) : section.data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-brand-muted font-ploni">
                  אין נתונים לטווח זה.
                </div>
              ) : section.chartType === "kpi" ? (
                <KpiCard data={section.data} metricDef={metricDef} currency={currency} />
              ) : (
                <ChartRenderer
                  chartType={section.chartType}
                  data={section.data}
                  metricDef={metricDef}
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
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-brand-border bg-brand-light p-3 text-sm font-ploni text-brand-muted hover:border-brand-gold hover:text-brand-dark transition-colors duration-200"
        >
          <Plus size={16} />
          הוסף גרף
        </button>
      )}
    </div>
  );
}

// --- KPI card ---

function KpiCard({
  data,
  metricDef,
  currency,
}: {
  data: SeriesPoint[];
  metricDef: MetricDef;
  currency: string;
}) {
  const total = data.reduce((sum, p) => sum + p.value, 0);
  // for rate metrics (ctr, cpc, cpm, roas, cost_per_conversion etc.) show average instead of sum
  const isRate = ["percent", "decimal"].includes(metricDef.format) ||
    metricDef.id.includes("cost_per") ||
    metricDef.id.includes("cpc") ||
    metricDef.id.includes("cpm") ||
    metricDef.id.includes("averageCpc") ||
    metricDef.id.includes("averageCpm") ||
    metricDef.id.includes("costPerConversion");
  const displayValue = isRate ? total / data.length : total;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <span className="text-sm font-ploni text-brand-muted">{metricDef.label}</span>
      <span className="text-4xl font-ploni font-semibold text-brand-dark">
        {formatValue(displayValue, metricDef.format, currency)}
      </span>
      <span className="text-xs font-ploni text-brand-muted">
        {data.length} ימים
      </span>
    </div>
  );
}

// --- Chart renderer ---

function ChartRenderer({
  chartType,
  data,
  metricDef,
  currency,
}: {
  chartType: "line" | "bar" | "area";
  data: SeriesPoint[];
  metricDef: MetricDef;
  currency: string;
}) {
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
      tickFormatter={(v: number) => formatAxisValue(v, metricDef.format, currency)}
      stroke="#666666"
      tick={{ fontSize: 12, fontFamily: "Ploni" }}
      orientation="right"
    />
  );

  const commonTooltip = (
    <Tooltip
      formatter={(value: unknown) => [
        formatValue(Number(value) || 0, metricDef.format, currency),
        metricDef.label,
      ]}
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

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === "bar" ? (
        <BarChart data={data} margin={margin}>
          {commonGrid}
          {commonXAxis}
          {commonYAxis}
          {commonTooltip}
          <Bar dataKey="value" fill="#eed89b" radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : chartType === "area" ? (
        <AreaChart data={data} margin={margin}>
          {commonGrid}
          {commonXAxis}
          {commonYAxis}
          {commonTooltip}
          <Area
            type="monotone"
            dataKey="value"
            stroke="#eed89b"
            strokeWidth={2}
            fill="#eed89b"
            fillOpacity={0.2}
          />
        </AreaChart>
      ) : (
        <LineChart data={data} margin={margin}>
          {commonGrid}
          {commonXAxis}
          {commonYAxis}
          {commonTooltip}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#eed89b"
            strokeWidth={2}
            dot={{ fill: "#eed89b", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
