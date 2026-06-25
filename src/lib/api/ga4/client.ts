// Google Analytics 4 — Data API client (batchRunReports)
// טאב אדפטיבי: מצב "ecom" (חנות) מול "leads" (לידים/שירותי).
// תיעוד: https://developers.google.com/analytics/devguides/reporting/data/v1

const GA4_API = "https://analyticsdata.googleapis.com/v1beta";

export type AnalyticsMode = "ecom" | "leads";

interface Ga4Row {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
}
interface Ga4Report {
  rows?: Ga4Row[];
}

export interface ChannelRow {
  name: string;
  sessions: number;
  value: number; // הכנסה (ecom) או המרות (leads)
  convRate: number; // 0..1
}
export interface ItemRow {
  name: string; // שם מוצר (ecom) או דף נחיתה (leads)
  primary: number; // הכנסה (ecom) / סשנים (leads)
  secondary: number; // יחידות (ecom) / המרות (leads)
}
export interface TsRow {
  date: string;
  primary: number; // הכנסה (ecom) / המרות (leads)
  sessions: number;
}

export interface AnalyticsData {
  mode: AnalyticsMode;
  summary: Record<string, number>;
  channels: ChannelRow[];
  items: ItemRow[];
  timeseries: TsRow[];
  highlights: { topValueChannel: string | null; topConvRateChannel: string | null };
}

const num = (v?: string) => Number(v ?? 0);

function buildRequests(mode: AnalyticsMode, days: number) {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  if (mode === "ecom") {
    return [
      { dateRanges, metrics: ["totalRevenue", "transactions", "sessions", "totalUsers", "addToCarts", "checkouts", "averagePurchaseRevenue"].map((name) => ({ name })) },
      { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "totalRevenue" }, { name: "transactions" }], orderBys: [{ metric: { metricName: "totalRevenue" }, desc: true }], limit: 10 },
      { dateRanges, dimensions: [{ name: "itemName" }], metrics: [{ name: "itemRevenue" }, { name: "itemsPurchased" }], orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }], limit: 10 },
      { dateRanges, dimensions: [{ name: "date" }], metrics: [{ name: "totalRevenue" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }] },
    ];
  }
  return [
    { dateRanges, metrics: ["keyEvents", "sessions", "totalUsers", "screenPageViews", "bounceRate", "averageSessionDuration"].map((name) => ({ name })) },
    { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "keyEvents" }], orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }], limit: 10 },
    { dateRanges, dimensions: [{ name: "landingPage" }], metrics: [{ name: "sessions" }, { name: "keyEvents" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 10 },
    { dateRanges, dimensions: [{ name: "date" }], metrics: [{ name: "keyEvents" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }] },
  ];
}

/**
 * שולף נתוני אנליטיקס לפי מצב (ecom/leads). זורק אם הקריאה נכשלה.
 */
export async function fetchAnalytics(propertyId: string, accessToken: string, days: number, mode: AnalyticsMode): Promise<AnalyticsData> {
  const res = await fetch(`${GA4_API}/properties/${propertyId}:batchRunReports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: buildRequests(mode, days) }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 API error: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const reports: Ga4Report[] = data.reports ?? [];

  // --- סיכום (דוח 0) ---
  const sv = reports[0]?.rows?.[0]?.metricValues ?? [];
  const summary: Record<string, number> =
    mode === "ecom"
      ? { revenue: num(sv[0]?.value), transactions: num(sv[1]?.value), sessions: num(sv[2]?.value), users: num(sv[3]?.value), addToCarts: num(sv[4]?.value), checkouts: num(sv[5]?.value), aov: num(sv[6]?.value) }
      : { keyEvents: num(sv[0]?.value), sessions: num(sv[1]?.value), users: num(sv[2]?.value), pageViews: num(sv[3]?.value), bounceRate: num(sv[4]?.value), avgSessionDuration: num(sv[5]?.value) };

  // יחס המרה כללי — מחושב מהמספרים הגולמיים
  if (mode === "ecom") summary.convRate = summary.sessions > 0 ? summary.transactions / summary.sessions : 0;
  else summary.convRate = summary.sessions > 0 ? summary.keyEvents / summary.sessions : 0;

  // --- ערוצים (דוח 1) ---
  const channels: ChannelRow[] = (reports[1]?.rows ?? []).map((r) => {
    const sessions = num(r.metricValues?.[0]?.value);
    const value = mode === "ecom" ? num(r.metricValues?.[1]?.value) : num(r.metricValues?.[1]?.value);
    const conversions = mode === "ecom" ? num(r.metricValues?.[2]?.value) : num(r.metricValues?.[1]?.value);
    return { name: r.dimensionValues?.[0]?.value ?? "—", sessions, value, convRate: sessions > 0 ? conversions / sessions : 0 };
  });

  // --- פריטים (דוח 2): מוצרים (ecom) או דפי נחיתה (leads) ---
  const items: ItemRow[] = (reports[2]?.rows ?? []).map((r) => ({
    name: r.dimensionValues?.[0]?.value ?? "—",
    primary: num(r.metricValues?.[0]?.value),
    secondary: num(r.metricValues?.[1]?.value),
  }));

  // --- סדרת זמן (דוח 3) ---
  const timeseries: TsRow[] = (reports[3]?.rows ?? []).map((r) => {
    const raw = r.dimensionValues?.[0]?.value ?? "";
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return { date, primary: num(r.metricValues?.[0]?.value), sessions: num(r.metricValues?.[1]?.value) };
  });

  // --- הדגשות: הערוץ עם הכי הרבה ערך, והערוץ עם יחס ההמרה הגבוה (מינ' 20 סשנים) ---
  const topValueChannel = channels.length ? [...channels].sort((a, b) => b.value - a.value)[0].name : null;
  const eligible = channels.filter((c) => c.sessions >= 20);
  const pool = eligible.length ? eligible : channels;
  const topConvRateChannel = pool.length ? [...pool].sort((a, b) => b.convRate - a.convRate)[0].name : null;

  return { mode, summary, channels, items, timeseries, highlights: { topValueChannel, topConvRateChannel } };
}
