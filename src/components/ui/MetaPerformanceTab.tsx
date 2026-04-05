"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DateRangePicker, { getPresetRange, type DateRange } from "./DateRangePicker";
import { getCurrencySymbol } from "@/lib/utils/currency";

interface Props {
  clientId: string;
  currency: string;
}

type MetricFormat = "money" | "number" | "percent" | "decimal";

interface MetricDef {
  id: string;
  label: string;
  format: MetricFormat;
  eventOverride?: string;
}

const METRICS: MetricDef[] = [
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

interface SeriesPoint {
  date: string;
  value: number;
}

interface SectionState {
  id: number;
  metric: string;
  range: DateRange;
  data: SeriesPoint[];
  loading: boolean;
}

function getMetricDef(id: string): MetricDef {
  return METRICS.find((m) => m.id === id) ?? METRICS[0];
}

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

export default function MetaPerformanceTab({ clientId, currency }: Props) {
  const [sections, setSections] = useState<SectionState[]>([
    {
      id: 1,
      metric: "spend",
      range: getPresetRange("this_month"),
      data: [],
      loading: false,
    },
    {
      id: 2,
      metric: "conversions",
      range: getPresetRange("this_month"),
      data: [],
      loading: false,
    },
    {
      id: 3,
      metric: "cost_per_conversion",
      range: getPresetRange("this_month"),
      data: [],
      loading: false,
    },
  ]);

  const fetchSection = useCallback(
    async (sectionId: number, metric: string, range: DateRange) => {
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, loading: true } : s)),
      );
      try {
        const metricDef = getMetricDef(metric);
        const params = new URLSearchParams({
          metric,
          since: range.since,
          until: range.until,
        });
        if (metricDef.eventOverride) {
          params.set("event", metricDef.eventOverride);
        }
        const res = await fetch(
          `/api/clients/${clientId}/meta-timeseries?${params.toString()}`,
        );
        if (!res.ok) throw new Error("failed");
        const json = await res.json();
        const series: SeriesPoint[] = Array.isArray(json.series) ? json.series : [];
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
    [clientId],
  );

  useEffect(() => {
    sections.forEach((s) => {
      fetchSection(s.id, s.metric, s.range);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleMetricChange = (sectionId: number, metric: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, metric } : s)),
    );
    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      fetchSection(sectionId, metric, section.range);
    }
  };

  const handleRangeChange = (sectionId: number, range: DateRange) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, range } : s)),
    );
    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      fetchSection(sectionId, section.metric, range);
    }
  };

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {sections.map((section) => {
        const metricDef = getMetricDef(section.metric);
        return (
          <div
            key={section.id}
            className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <select
                value={section.metric}
                onChange={(e) => handleMetricChange(section.id, e.target.value)}
                className="rounded-md border border-brand-border bg-white px-3 py-2 text-sm font-ploni focus:outline-none focus:ring-2 focus:ring-brand-primary"
              >
                {METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <DateRangePicker
                value={section.range}
                onChange={(r) => handleRangeChange(section.id, r)}
              />
            </div>
            <div className="h-[260px] w-full">
              {section.loading ? (
                <div className="flex h-full items-center justify-center text-sm text-brand-muted font-ploni">
                  טוען...
                </div>
              ) : section.data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-brand-muted font-ploni">
                  אין נתונים לטווח זה.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={section.data}
                    margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateShort}
                      stroke="#666666"
                      tick={{ fontSize: 12, fontFamily: "Ploni" }}
                      reversed
                    />
                    <YAxis
                      tickFormatter={(v: number) =>
                        formatAxisValue(v, metricDef.format, currency)
                      }
                      stroke="#666666"
                      tick={{ fontSize: 12, fontFamily: "Ploni" }}
                      orientation="right"
                    />
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
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#eed89b"
                      strokeWidth={2}
                      dot={{ fill: "#eed89b", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
