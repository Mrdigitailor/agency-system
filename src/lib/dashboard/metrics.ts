// קטלוג מטריקות לבנאי הדשבורד — מקור אמת יחיד לבורר הווידג'טים ולמנוע הנתונים.
import { getCurrencySymbol } from "@/lib/utils/currency";

export type Platform = "meta" | "google_ads" | "tiktok" | "ga4" | "all";
export type DisplayType = "kpi" | "line" | "area" | "bar" | "pie" | "table";
export type Dimension = "none" | "date" | "week" | "month" | "platform" | "campaign" | "channel";

export interface MetricDef {
  id: string;
  label: string;
  platforms: Platform[]; // אילו פלטפורמות-ווידג'ט יכולות להשתמש במטריקה
  unit: "currency" | "number" | "percent" | "ratio";
  kind: "additive" | "derived"; // derived מחושב מרכיבים מסוכמים לכל bucket
}

const AD: Platform[] = ["meta", "google_ads", "tiktok", "all"];

export const METRICS: MetricDef[] = [
  { id: "spend", label: "הוצאה", platforms: AD, unit: "currency", kind: "additive" },
  { id: "impressions", label: "חשיפות", platforms: AD, unit: "number", kind: "additive" },
  { id: "clicks", label: "קליקים", platforms: AD, unit: "number", kind: "additive" },
  { id: "conversions", label: "המרות", platforms: AD, unit: "number", kind: "additive" },
  { id: "cpa", label: "עלות להמרה", platforms: AD, unit: "currency", kind: "derived" },
  { id: "ctr", label: "CTR", platforms: AD, unit: "percent", kind: "derived" },
  { id: "cpc", label: "CPC", platforms: AD, unit: "currency", kind: "derived" },
  { id: "cpm", label: "CPM", platforms: AD, unit: "currency", kind: "derived" },
  { id: "purchaseValue", label: "ערך רכישות", platforms: ["meta", "all"], unit: "currency", kind: "additive" },
  { id: "roas", label: "ROAS", platforms: ["meta", "all"], unit: "ratio", kind: "derived" },
  // GA4
  { id: "ga4_sessions", label: "סשנים (אתר)", platforms: ["ga4"], unit: "number", kind: "additive" },
  { id: "ga4_users", label: "משתמשים (אתר)", platforms: ["ga4"], unit: "number", kind: "additive" },
  { id: "ga4_revenue", label: "הכנסות (אתר)", platforms: ["ga4"], unit: "currency", kind: "additive" },
  { id: "ga4_transactions", label: "עסקאות (אתר)", platforms: ["ga4"], unit: "number", kind: "additive" },
  { id: "ga4_keyEvents", label: "אירועי מפתח (אתר)", platforms: ["ga4"], unit: "number", kind: "additive" },
  { id: "ga4_convRate", label: "יחס המרה (אתר)", platforms: ["ga4"], unit: "percent", kind: "derived" },
];

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export function getMetricsForPlatform(platform: Platform): MetricDef[] {
  return METRICS.filter((m) => m.platforms.includes(platform));
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: "Meta",
  google_ads: "Google Ads",
  tiktok: "TikTok",
  ga4: "Google Analytics",
  all: "כל הפלטפורמות",
};

export const DISPLAY_LABELS: Record<DisplayType, string> = {
  kpi: "כרטיס מספר (KPI)",
  line: "גרף קו",
  area: "גרף שטח",
  bar: "גרף עמודות",
  pie: "גרף עוגה",
  table: "טבלה",
};

const fmtNum = (n: number) => Math.round(n).toLocaleString("he-IL");

/** עיצוב ערך מטריקה לתצוגה לפי היחידה והמטבע */
export function formatMetric(value: number, def: MetricDef | undefined, currency: string): string {
  if (!def) return fmtNum(value);
  switch (def.unit) {
    case "currency":
      return `${getCurrencySymbol(currency)}${fmtNum(value)}`;
    case "percent":
      return `${value.toFixed(2)}%`;
    case "ratio":
      return value.toFixed(2);
    default:
      return fmtNum(value);
  }
}
