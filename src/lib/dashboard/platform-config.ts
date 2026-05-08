// Dashboard widget platform configurations

export interface MetricDef {
  id: string;
  label: string;
  labelEn: string;
  format: "money" | "number" | "percent" | "decimal";
}

export interface LevelDef {
  id: string;
  label: string;
  labelEn: string;
}

export interface PlatformConfig {
  id: string;
  label: string;
  levels: LevelDef[];
  metrics: MetricDef[];
}

export const PLATFORMS_CONFIG: PlatformConfig[] = [
  {
    id: "meta",
    label: "Meta Ads",
    levels: [
      { id: "account", label: "חשבון", labelEn: "Account" },
      { id: "campaign", label: "קמפיין", labelEn: "Campaign" },
      { id: "adset", label: "קבוצת מודעות", labelEn: "Ad Set" },
      { id: "ad", label: "מודעה", labelEn: "Ad" },
    ],
    metrics: [
      { id: "spend", label: "הוצאה", labelEn: "Spend", format: "money" },
      { id: "impressions", label: "חשיפות", labelEn: "Impressions", format: "number" },
      { id: "reach", label: "חשיפה ייחודית", labelEn: "Reach", format: "number" },
      { id: "frequency", label: "תדירות", labelEn: "Frequency", format: "decimal" },
      { id: "clicks", label: "קליקים", labelEn: "Clicks", format: "number" },
      { id: "link_clicks", label: "קליקי קישור", labelEn: "Link Clicks", format: "number" },
      { id: "ctr", label: "CTR", labelEn: "CTR", format: "percent" },
      { id: "cpc", label: "CPC", labelEn: "CPC", format: "money" },
      { id: "cpm", label: "CPM", labelEn: "CPM", format: "money" },
      { id: "conversions", label: "המרות", labelEn: "Conversions", format: "number" },
      { id: "cost_per_conversion", label: "עלות להמרה", labelEn: "Cost/Conv", format: "money" },
      { id: "roas", label: "ROAS", labelEn: "ROAS", format: "decimal" },
      { id: "purchases", label: "רכישות", labelEn: "Purchases", format: "number" },
      { id: "purchase_value", label: "ערך רכישות", labelEn: "Purchase Value", format: "money" },
      { id: "leads", label: "לידים", labelEn: "Leads", format: "number" },
      { id: "cost_per_lead", label: "עלות לליד", labelEn: "CPL", format: "money" },
      { id: "video_views", label: "צפיות וידאו", labelEn: "Video Views", format: "number" },
      { id: "engagement", label: "מעורבות", labelEn: "Engagement", format: "number" },
    ],
  },
  {
    id: "google_ads",
    label: "Google Ads",
    levels: [
      { id: "customer", label: "חשבון", labelEn: "Account" },
      { id: "campaign", label: "קמפיין", labelEn: "Campaign" },
      { id: "ad_group", label: "קבוצת מודעות", labelEn: "Ad Group" },
    ],
    metrics: [
      { id: "spend", label: "הוצאה", labelEn: "Cost", format: "money" },
      { id: "impressions", label: "חשיפות", labelEn: "Impressions", format: "number" },
      { id: "clicks", label: "קליקים", labelEn: "Clicks", format: "number" },
      { id: "ctr", label: "CTR", labelEn: "CTR", format: "percent" },
      { id: "averageCpc", label: "CPC ממוצע", labelEn: "Avg CPC", format: "money" },
      { id: "averageCpm", label: "CPM ממוצע", labelEn: "Avg CPM", format: "money" },
      { id: "conversions", label: "המרות", labelEn: "Conversions", format: "number" },
      { id: "conversionsValue", label: "ערך המרות", labelEn: "Conv Value", format: "money" },
      { id: "costPerConversion", label: "עלות להמרה", labelEn: "Cost/Conv", format: "money" },
      { id: "searchImprShare", label: "נתח חשיפה", labelEn: "Search Impr Share", format: "percent" },
      { id: "videoViews", label: "צפיות וידאו", labelEn: "Video Views", format: "number" },
    ],
  },
  {
    id: "ga4",
    label: "Google Analytics",
    levels: [
      { id: "overall", label: "כללי", labelEn: "Overall" },
      { id: "landingPage", label: "דף נחיתה", labelEn: "Landing Page" },
      { id: "source", label: "מקור תנועה", labelEn: "Source/Medium" },
      { id: "deviceCategory", label: "מכשיר", labelEn: "Device" },
      { id: "country", label: "מדינה", labelEn: "Country" },
    ],
    metrics: [
      { id: "sessions", label: "סשנים", labelEn: "Sessions", format: "number" },
      { id: "users", label: "משתמשים", labelEn: "Users", format: "number" },
      { id: "newUsers", label: "משתמשים חדשים", labelEn: "New Users", format: "number" },
      { id: "pageViews", label: "צפיות עמוד", labelEn: "Page Views", format: "number" },
      { id: "bounceRate", label: "אחוז נטישה", labelEn: "Bounce Rate", format: "percent" },
      { id: "avgSessionDuration", label: "זמן ממוצע", labelEn: "Avg Duration", format: "decimal" },
      { id: "conversions", label: "המרות", labelEn: "Conversions", format: "number" },
      { id: "events", label: "אירועים", labelEn: "Events", format: "number" },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok Ads",
    levels: [
      { id: "advertiser", label: "חשבון", labelEn: "Account" },
      { id: "campaign", label: "קמפיין", labelEn: "Campaign" },
      { id: "adgroup", label: "קבוצת מודעות", labelEn: "Ad Group" },
    ],
    metrics: [
      { id: "spend", label: "הוצאה", labelEn: "Spend", format: "money" },
      { id: "impressions", label: "חשיפות", labelEn: "Impressions", format: "number" },
      { id: "reach", label: "חשיפה", labelEn: "Reach", format: "number" },
      { id: "clicks", label: "קליקים", labelEn: "Clicks", format: "number" },
      { id: "ctr", label: "CTR", labelEn: "CTR", format: "percent" },
      { id: "cpc", label: "CPC", labelEn: "CPC", format: "money" },
      { id: "cpm", label: "CPM", labelEn: "CPM", format: "money" },
      { id: "conversions", label: "המרות", labelEn: "Conversions", format: "number" },
      { id: "costPerConversion", label: "עלות להמרה", labelEn: "Cost/Conv", format: "money" },
      { id: "videoViews", label: "צפיות וידאו", labelEn: "Video Views", format: "number" },
      { id: "likes", label: "לייקים", labelEn: "Likes", format: "number" },
      { id: "comments", label: "תגובות", labelEn: "Comments", format: "number" },
      { id: "shares", label: "שיתופים", labelEn: "Shares", format: "number" },
      { id: "follows", label: "עוקבים חדשים", labelEn: "New Followers", format: "number" },
    ],
  },
];

export const DIMENSIONS = [
  { id: "date", label: "תאריך (יומי)", labelEn: "Date (Daily)" },
  { id: "week", label: "שבוע", labelEn: "Week" },
  { id: "month", label: "חודש", labelEn: "Month" },
  { id: "gender", label: "מגדר", labelEn: "Gender" },
  { id: "age", label: "גיל", labelEn: "Age" },
  { id: "device", label: "מכשיר", labelEn: "Device" },
  { id: "country", label: "מיקום", labelEn: "Location" },
];

export const DISPLAY_TYPES = [
  { id: "table", label: "טבלה", labelEn: "Table", icon: "▤" },
  { id: "kpi", label: "מספר", labelEn: "KPI", icon: "#" },
  { id: "line", label: "גרף קווי", labelEn: "Line", icon: "📈" },
  { id: "bar", label: "עמודות", labelEn: "Bar", icon: "📊" },
  { id: "pie", label: "פאי", labelEn: "Pie", icon: "🥧" },
  { id: "area", label: "שטח", labelEn: "Area", icon: "▓" },
];

export const SIZES = [
  { id: "full", label: "100%", icon: "▬" },
  { id: "half", label: "50%", icon: "▐▌" },
  { id: "third", label: "33%", icon: "▐▐▌" },
];

export function getPlatformConfig(id: string): PlatformConfig | undefined {
  return PLATFORMS_CONFIG.find((p) => p.id === id);
}
