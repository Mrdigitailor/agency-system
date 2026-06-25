// Google Analytics 4 — Data API client (batchRunReports)
// תיעוד: https://developers.google.com/analytics/devguides/reporting/data/v1

const GA4_API = "https://analyticsdata.googleapis.com/v1beta";

interface Ga4Row {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
}
interface Ga4Report {
  rows?: Ga4Row[];
}

export interface Ga4Summary {
  users: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  bounceRate: number; // 0..1
  avgSessionDuration: number; // seconds
  events: number;
}

export interface AnalyticsData {
  summary: Ga4Summary;
  channels: Array<{ name: string; sessions: number }>;
  topPages: Array<{ path: string; views: number }>;
  timeseries: Array<{ date: string; sessions: number; users: number }>;
}

const SUMMARY_METRICS = [
  "totalUsers",
  "newUsers",
  "sessions",
  "screenPageViews",
  "bounceRate",
  "averageSessionDuration",
  "eventCount",
] as const;

/**
 * שולף סיכום אנליטיקס לטווח ימים נתון מ-property של GA4.
 * זורק אם הקריאה נכשלה (לדוגמה אין הרשאה ל-property).
 */
export async function fetchAnalytics(propertyId: string, accessToken: string, days: number): Promise<AnalyticsData> {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];

  const body = {
    requests: [
      { dateRanges, metrics: SUMMARY_METRICS.map((name) => ({ name })) },
      {
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8,
      },
      {
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      },
      {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    ],
  };

  const res = await fetch(`${GA4_API}/properties/${propertyId}:batchRunReports`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 API error: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const reports: Ga4Report[] = data.reports ?? [];

  // דוח 0 — סיכום
  const summaryRow = reports[0]?.rows?.[0]?.metricValues ?? [];
  const m = (i: number) => Number(summaryRow[i]?.value ?? 0);
  const summary: Ga4Summary = {
    users: m(0),
    newUsers: m(1),
    sessions: m(2),
    pageViews: m(3),
    bounceRate: m(4),
    avgSessionDuration: m(5),
    events: m(6),
  };

  // דוח 1 — ערוצי תנועה
  const channels = (reports[1]?.rows ?? []).map((r) => ({
    name: r.dimensionValues?.[0]?.value ?? "—",
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
  }));

  // דוח 2 — דפים מובילים
  const topPages = (reports[2]?.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "—",
    views: Number(r.metricValues?.[0]?.value ?? 0),
  }));

  // דוח 3 — סדרת זמן (YYYYMMDD → YYYY-MM-DD)
  const timeseries = (reports[3]?.rows ?? []).map((r) => {
    const raw = r.dimensionValues?.[0]?.value ?? "";
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return {
      date,
      sessions: Number(r.metricValues?.[0]?.value ?? 0),
      users: Number(r.metricValues?.[1]?.value ?? 0),
    };
  });

  return { summary, channels, topPages, timeseries };
}
