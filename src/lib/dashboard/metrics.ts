// קטלוג מטריקות לבנאי הדשבורד — מקור אמת יחיד לבורר הווידג'טים ולמנוע הנתונים.
import { getCurrencySymbol } from "@/lib/utils/currency";

export type Platform = "meta" | "google_ads" | "tiktok" | "ga4" | "all";
export type DisplayType = "kpi" | "line" | "area" | "bar" | "pie" | "table" | "heading" | "text" | "platform_header";
export type Dimension = "none" | "date" | "week" | "month" | "platform" | "campaign" | "adset" | "ad" | "channel" | "action" | "searchTerm" | "age" | "gender" | "device";

export interface MetricDef {
  id: string;
  label: string;
  platforms: Platform[]; // אילו פלטפורמות-ווידג'ט יכולות להשתמש במטריקה
  unit: "currency" | "number" | "percent" | "ratio";
  kind: "additive" | "derived"; // derived מחושב מרכיבים מסוכמים לכל bucket
}

const AD: Platform[] = ["meta", "google_ads", "tiktok", "all"];
const META_ALL: Platform[] = ["meta", "all"];

export const METRICS: MetricDef[] = [
  { id: "spend", label: "הוצאה", platforms: AD, unit: "currency", kind: "additive" },
  { id: "impressions", label: "חשיפות", platforms: AD, unit: "number", kind: "additive" },
  { id: "clicks", label: "קליקים", platforms: AD, unit: "number", kind: "additive" },
  { id: "conversions", label: "המרות", platforms: AD, unit: "number", kind: "additive" },
  { id: "cpa", label: "עלות להמרה", platforms: AD, unit: "currency", kind: "derived" },
  { id: "convRate", label: "אחוז המרה", platforms: AD, unit: "percent", kind: "derived" },
  { id: "ctr", label: "CTR", platforms: AD, unit: "percent", kind: "derived" },
  { id: "cpc", label: "CPC", platforms: AD, unit: "currency", kind: "derived" },
  { id: "cpm", label: "CPM", platforms: AD, unit: "currency", kind: "derived" },
  // מדדי מטא נוספים (עמודות קיימות ב-MetaInsightDaily).
  // reach = משתמשים ייחודיים; לא ניתן לסכימה יומית ולכן נשלף חי ברמת החשבון לטווח.
  { id: "reach", label: "משתמשים ייחודיים (Reach)", platforms: META_ALL, unit: "number", kind: "additive" },
  { id: "linkClicks", label: "קליקים למעבר לאתר", platforms: META_ALL, unit: "number", kind: "additive" },
  { id: "cplc", label: "עלות לקליק-קישור", platforms: META_ALL, unit: "currency", kind: "derived" },
  { id: "landingPageViews", label: "צפיות בדף נחיתה", platforms: META_ALL, unit: "number", kind: "additive" },
  { id: "leads", label: "לידים", platforms: META_ALL, unit: "number", kind: "additive" },
  { id: "cpl", label: "עלות לליד", platforms: META_ALL, unit: "currency", kind: "derived" },
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
  heading: "כותרת / מפריד",
  text: "טקסט חופשי",
  platform_header: "כותרת פלטפורמה (לוגו)",
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  none: "ללא (סיכום)",
  date: "לפי יום",
  week: "לפי שבוע",
  month: "לפי חודש",
  platform: "לפי פלטפורמה",
  campaign: "לפי קמפיין",
  adset: "לפי קהל (Meta)",
  ad: "לפי מודעה (Meta)",
  channel: "לפי ערוץ",
  action: "לפי סוג המרה",
  searchTerm: "לפי מונח חיפוש (Google)",
  age: "לפי גיל",
  gender: "לפי מגדר",
  device: "לפי מכשיר",
};

/** הפילוחים החוקיים לכל סוג תצוגה (ופלטפורמה — פילוחים דמוגרפיים זמינים ל-Google Ads) */
export function validDimensions(displayType: DisplayType, platform?: Platform): Dimension[] {
  let dims: Dimension[];
  switch (displayType) {
    case "kpi": dims = ["none"]; break;
    case "line":
    case "area":
    case "bar": dims = ["date", "week", "month", "platform"]; break;
    case "pie": dims = ["platform", "campaign"]; break;
    case "table": dims = ["campaign"]; break;
    default: dims = ["none"];
  }
  // פילוח לפי סוג המרה — מטא/גוגל/הכל (לא TikTok/GA4), בתצוגות pie/bar/table
  if (
    (platform === "meta" || platform === "google_ads" || platform === "all") &&
    (displayType === "pie" || displayType === "bar" || displayType === "table")
  ) {
    dims = [...dims, "action"];
  }
  // מונחי חיפוש — טבלה בלבד, ל-Google Ads / כל הפלטפורמות
  if ((platform === "google_ads" || platform === "all") && displayType === "table") {
    dims = [...dims, "searchTerm"];
  }
  // קהלים (adset) + מודעות (ad) — טבלה בלבד, ל-Meta (הנתונים מסונכרנים ברמות אלו)
  if (platform === "meta" && displayType === "table") {
    dims = [...dims, "adset", "ad"];
  }
  // פילוחים דמוגרפיים — Meta ו-Google Ads, בתצוגות pie/bar
  if ((platform === "google_ads" || platform === "meta") && (displayType === "pie" || displayType === "bar")) {
    dims = [...dims.filter((d) => d !== "campaign"), "age", "gender", "device"];
  }
  return dims;
}

export const TEXT_DISPLAYS: DisplayType[] = ["heading", "text", "platform_header"];

/** תצוגות ללא שליפת נתונים (טקסט/כותרת/כותרת-פלטפורמה) */
export const NO_DATA_DISPLAYS: DisplayType[] = ["heading", "text", "platform_header"];

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
