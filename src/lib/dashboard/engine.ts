// מנוע נתוני הדשבורד — session-agnostic. מקבל קונפיג ווידג'ט + טווח ומחזיר נתונים מחושבים.
// משמש גם את ה-preview (admin) וגם את ה-API הציבורי. מנצל לוגיקה קיימת.

import { prisma } from "@/lib/db/prisma";
import { countConversions, aggregateConversionActions } from "@/lib/utils/metaMetrics";
import { countGoogleConversions } from "@/lib/utils/googleMetrics";
import { fetchCustomConversions } from "@/lib/api/meta/conversions";
import { fetchAdInsights } from "@/lib/api/meta/ad-insights";
import { normalizeName } from "@/lib/reports/group-by-product";
import { fetchAnalytics, type AnalyticsData } from "@/lib/api/ga4/client";
import { getValidGoogleToken } from "@/lib/api/google-ads/client";
import { fetchGoogleSegment, type GoogleSegment, type SegmentRow } from "@/lib/api/google-ads/segments";
import { METRIC_BY_ID, PLATFORM_LABELS, type Platform, type DisplayType, type Dimension } from "./metrics";

export interface DateRange { since: string; until: string }
export interface WidgetConfig {
  id: string;
  platform: Platform;
  metrics: string[];
  dimension: Dimension;
  displayType: DisplayType;
  size: "full" | "half" | "third";
  title: string;
  textBody: string;
  compare: boolean;
  /** סינון לפי שם קמפיין (מכיל, מנורמל) — מאפשר ווידג'טים פר-מוצר */
  campaignFilter?: string;
  /** בפילוח "לפי סוג המרה": תוויות סוגים להסתרה (למשל שלבי-ביניים של משפך) */
  excludeActions?: string[];
}
export interface ClientCtx {
  clientId: string;
  currency: string;
  clientType: string;
  metaConversionEvent: string;
  googleConversionAction: string;
}

export interface KpiResult { type: "kpi"; metrics: { id: string; label: string; value: number; unit: string; change?: number | null }[] }
export interface SeriesResult { type: "series"; display: "line" | "area" | "bar"; buckets: string[]; series: { id: string; label: string; values: number[] }[] }
export interface TableResult { type: "table"; columns: { id: string; label: string }[]; rows: (string | number)[][] }
export interface PieResult { type: "pie"; metricId: string; label: string; slices: { label: string; value: number }[] }
export interface TextResult { type: "text"; heading: boolean; body: string }
export interface EmptyResult { type: "empty"; reason: string }
export type WidgetData = KpiResult | SeriesResult | TableResult | PieResult | TextResult | EmptyResult;

function changePct(value: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return ((value - prev) / prev) * 100;
}

// ---------- רכיבי מטריקה (לחישוב מטריקות נגזרות מסכומים) ----------
interface Components { spend: number; impressions: number; clicks: number; conversions: number; purchaseValue: number; reach: number; linkClicks: number; landingPageViews: number }
const zero = (): Components => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, purchaseValue: 0, reach: 0, linkClicks: 0, landingPageViews: 0 });
function addInto(a: Components, b: Components) {
  a.spend += b.spend; a.impressions += b.impressions; a.clicks += b.clicks; a.conversions += b.conversions; a.purchaseValue += b.purchaseValue;
  a.reach += b.reach; a.linkClicks += b.linkClicks; a.landingPageViews += b.landingPageViews;
}
function metricValue(id: string, c: Components): number {
  switch (id) {
    case "spend": return c.spend;
    case "impressions": return c.impressions;
    case "clicks": return c.clicks;
    case "conversions": return c.conversions;
    case "purchaseValue": return c.purchaseValue;
    case "reach": return c.reach;
    case "linkClicks": return c.linkClicks;
    case "landingPageViews": return c.landingPageViews;
    case "cpa": return c.conversions > 0 ? c.spend / c.conversions : 0;
    case "convRate": return c.clicks > 0 ? (c.conversions / c.clicks) * 100 : 0;
    case "ctr": return c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
    case "cpc": return c.clicks > 0 ? c.spend / c.clicks : 0;
    case "cpm": return c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0;
    case "roas": return c.spend > 0 ? c.purchaseValue / c.spend : 0;
    default: return 0;
  }
}

// ---------- שורות גולמיות ----------
interface MetaRow { spend: number; impressions: number; clicks: number; purchaseValue: number; conversions: number; leads: number; purchases: number; reach: number; linkClicks: number; landingPageViews: number; actionsJson: string; name: string; date: string }
interface GoogleRow { spend: number; impressions: number; clicks: number; conversions: number; conversionsValue: number; conversionsByAction: string; campaignName: string; date: string }
interface TiktokRow { spend: number; impressions: number; clicks: number; conversions: number; campaignName: string; date: string }

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
const metaComp = (rows: MetaRow[], event: string): Components => ({ spend: sum(rows, r => r.spend), impressions: sum(rows, r => r.impressions), clicks: sum(rows, r => r.clicks), purchaseValue: sum(rows, r => r.purchaseValue), conversions: countConversions(rows, event), reach: sum(rows, r => r.reach), linkClicks: sum(rows, r => r.linkClicks), landingPageViews: sum(rows, r => r.landingPageViews) });
const googleComp = (rows: GoogleRow[], action: string): Components => ({ spend: sum(rows, r => r.spend), impressions: sum(rows, r => r.impressions), clicks: sum(rows, r => r.clicks), purchaseValue: sum(rows, r => r.conversionsValue), conversions: countGoogleConversions(rows, action), reach: 0, linkClicks: 0, landingPageViews: 0 });
const tiktokComp = (rows: TiktokRow[]): Components => ({ spend: sum(rows, r => r.spend), impressions: sum(rows, r => r.impressions), clicks: sum(rows, r => r.clicks), purchaseValue: 0, conversions: sum(rows, r => r.conversions), reach: 0, linkClicks: 0, landingPageViews: 0 });

// ---------- caches משותפים לבקשה ----------
interface AdRows { meta: MetaRow[]; google: GoogleRow[]; tiktok: TiktokRow[] }
type AdCache = { rows?: AdRows };
interface Ga4Cache { loaded: boolean; data: AnalyticsData | null }

async function getAdRows(ctx: ClientCtx, range: DateRange, cache: AdCache): Promise<AdRows> {
  if (cache.rows) return cache.rows;
  const date = { gte: range.since, lte: range.until };
  const [meta, google, tiktok] = await Promise.all([
    prisma.metaInsightDaily.findMany({ where: { clientId: ctx.clientId, level: "campaign", date } }),
    prisma.googleAdsInsightDaily.findMany({ where: { clientId: ctx.clientId, date } }),
    prisma.tikTokInsightDaily.findMany({ where: { clientId: ctx.clientId, date } }),
  ]);
  cache.rows = { meta: meta as MetaRow[], google: google as GoogleRow[], tiktok: tiktok as TiktokRow[] };
  return cache.rows;
}

function daysBetween(since: string, until: string): number {
  const d = Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1;
  return Math.min(Math.max(d, 1), 365);
}

function previousRange(r: DateRange): DateRange {
  const since = new Date(r.since);
  const days = Math.round((new Date(r.until).getTime() - since.getTime()) / 86400000) + 1;
  const prevUntil = new Date(since.getTime() - 86400000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400000);
  return { since: prevSince.toISOString().slice(0, 10), until: prevUntil.toISOString().slice(0, 10) };
}

const isText = (w: WidgetConfig) => w.displayType === "heading" || w.displayType === "text" || w.displayType === "platform_header";
const wantsCompare = (w: WidgetConfig) => w.compare && (w.displayType === "kpi" || w.dimension === "none") && !isText(w);

const SEGMENT_DIMS = new Set(["age", "gender", "device"]);
const isSegment = (w: WidgetConfig) => w.platform === "google_ads" && SEGMENT_DIMS.has(w.dimension);
const isSearchTerm = (w: WidgetConfig) => (w.platform === "google_ads" || w.platform === "all") && w.dimension === "searchTerm";

// ---------- מונחי חיפוש (Google Ads) ----------
interface SearchTermAgg { searchTerm: string; impressions: number; clicks: number; spend: number; conversions: number; conversionsValue: number }

async function fetchSearchTerms(ctx: ClientCtx, range: DateRange, campaignFilter?: string): Promise<SearchTermAgg[]> {
  let rows: Array<{ searchTerm: string; campaignName: string; impressions: number; clicks: number; spend: number; conversions: number; conversionsValue: number }>;
  try {
    rows = await prisma.googleSearchTermDaily.findMany({
      where: { clientId: ctx.clientId, date: { gte: range.since, lte: range.until } },
      select: { searchTerm: true, campaignName: true, impressions: true, clicks: true, spend: true, conversions: true, conversionsValue: true },
    });
  } catch { return []; } // הטבלה עדיין לא קיימת ב-DB — לא לשבור
  const f = campaignFilter ? normalizeName(campaignFilter) : "";
  const agg = new Map<string, SearchTermAgg>();
  for (const r of rows) {
    if (f && !normalizeName(r.campaignName).includes(f)) continue;
    const e = agg.get(r.searchTerm) ?? { searchTerm: r.searchTerm, impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionsValue: 0 };
    e.impressions += r.impressions; e.clicks += r.clicks; e.spend += r.spend; e.conversions += r.conversions; e.conversionsValue += r.conversionsValue;
    agg.set(r.searchTerm, e);
  }
  return [...agg.values()].sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks).slice(0, 50);
}

function searchTermToData(w: WidgetConfig, rows: SearchTermAgg[]): WidgetData {
  if (rows.length === 0) return { type: "empty", reason: "אין נתוני מונחי חיפוש בתקופה (זמין ל-Google Ads בלבד)" };
  const chosen = w.metrics.filter((m) => METRIC_BY_ID[m]?.platforms.some((p) => p === "google_ads" || p === "all"));
  const cols = chosen.length ? chosen : ["clicks", "conversions", "cpa"];
  const comp = (r: SearchTermAgg): Components => ({ ...zero(), spend: r.spend, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, purchaseValue: r.conversionsValue });
  return {
    type: "table",
    columns: [{ id: "term", label: "מונח חיפוש" }, ...cols.map((id) => ({ id, label: METRIC_BY_ID[id].label }))],
    rows: rows.map((r) => [r.searchTerm, ...cols.map((id) => Math.round(metricValue(id, comp(r)) * 100) / 100)]),
  };
}

function segmentToData(w: WidgetConfig, rows: SegmentRow[]): WidgetData {
  const metricId = w.metrics.find((m) => ["spend", "clicks", "conversions"].includes(m)) ?? "conversions";
  const val = (r: SegmentRow) => (metricId === "spend" ? r.spend : metricId === "clicks" ? r.clicks : r.conversions);
  const slices = rows.map((r) => ({ label: r.label, value: Math.round(val(r) * 100) / 100 })).filter((s) => s.value > 0);
  if (slices.length === 0) return { type: "empty", reason: "אין נתונים דמוגרפיים בתקופה" };
  const label = METRIC_BY_ID[metricId]?.label ?? "";
  if (w.displayType === "bar") return { type: "series", display: "bar", buckets: slices.map((s) => s.label), series: [{ id: metricId, label, values: slices.map((s) => s.value) }] };
  return { type: "pie", metricId, label, slices };
}

// ---------- פילוח "לפי סוג המרה" ----------

/** שמות ההמרות המותאמות של מטא (id→name) — best effort, קריאה חיה אחת לכל בקשה */
async function resolveMetaCustomNames(clientId: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const conn = await prisma.platformConnection.findFirst({
      where: { clientId, platform: "meta", isActive: true },
      include: { assets: { where: { isSelected: true, assetType: "ad_account" } } },
    });
    const asset = conn?.assets[0];
    if (!conn || !asset) return names;
    const list = await fetchCustomConversions(asset.externalId, conn.accessToken);
    for (const c of list) names.set(c.id, c.name);
  } catch { /* אין שמות — נציג מזהה */ }
  return names;
}

/** סופר את כל סוגי ההמרות בהיקף פלטפורמה נתון — משותף לווידג'ט ולרשימת הבחירה ב-UI */
function countActionTypes(platform: Platform, ad: AdRows, customNames: Map<string, string>): Map<string, number> {
  const counts = new Map<string, number>();
  if (platform === "meta" || platform === "all") {
    for (const a of aggregateConversionActions(ad.meta)) {
      const label = a.customId ? (customNames.get(a.customId) ?? a.label) : a.label;
      counts.set(label, (counts.get(label) ?? 0) + a.count);
    }
  }
  if (platform === "google_ads" || platform === "all") {
    for (const r of ad.google) {
      try {
        const byAction = JSON.parse(r.conversionsByAction || "{}") as Record<string, number>;
        for (const [name, count] of Object.entries(byAction)) {
          if (count > 0) counts.set(name, (counts.get(name) ?? 0) + count);
        }
      } catch { /* שורה בלי פירוט */ }
    }
  }
  return counts;
}

/** פירוק המרות לפי סוג אירוע — מטא (actionsJson) + גוגל (conversionsByAction) */
function actionBreakdown(w: WidgetConfig, ctx: ClientCtx, ad: AdRows, customNames: Map<string, string>): WidgetData {
  const counts = countActionTypes(w.platform, ad, customNames);
  const exclude = new Set(w.excludeActions ?? []);

  const entries = [...counts.entries()]
    .map(([label, count]) => ({ label, value: Math.round(count * 100) / 100 }))
    .filter((s) => s.value > 0 && !exclude.has(s.label))
    .sort((a, b) => b.value - a.value);

  if (entries.length === 0) return { type: "empty", reason: "אין פירוט המרות בתקופה" };

  if (w.displayType === "table") {
    // עלות ממוצעת = סך ההוצאה בטווח (בהיקף הפלטפורמה של הווידג'ט) חלקי כמות ההמרות מהסוג
    const totalSpend = rowsToComponents(w.platform, ad, ctx).spend;
    return {
      type: "table",
      columns: [{ id: "name", label: "סוג המרה" }, { id: "count", label: "כמות" }, { id: "cost", label: "עלות ממוצעת" }],
      rows: entries.map((e) => [e.label, e.value, Math.round((totalSpend / e.value) * 100) / 100]),
    };
  }
  if (w.displayType === "bar") {
    return { type: "series", display: "bar", buckets: entries.map((e) => e.label), series: [{ id: "conversions", label: "המרות", values: entries.map((e) => e.value) }] };
  }
  return { type: "pie", metricId: "conversions", label: "המרות", slices: entries.slice(0, 10) };
}

/** Reach מדויק (dedup) ברמת חשבון המודעות לטווח — שליפה חיה ממטא (לא ניתן לסכום יומי) */
async function fetchAccountReach(clientId: string, range: DateRange): Promise<number | null> {
  try {
    const conn = await prisma.platformConnection.findFirst({
      where: { clientId, platform: "meta", isActive: true },
      include: { assets: { where: { isSelected: true, assetType: "ad_account" } } },
    });
    const asset = conn?.assets[0];
    if (!conn || !asset) return null;
    const rows = await fetchAdInsights(asset.externalId, conn.accessToken, "account", range.since, range.until, false);
    return rows.reduce((s, r) => s + (parseInt(String(r.reach ?? "0")) || 0), 0);
  } catch { return null; }
}

async function getGa4(ctx: ClientCtx, range: DateRange, cache: Ga4Cache): Promise<AnalyticsData | null> {
  if (cache.loaded) return cache.data;
  cache.loaded = true;
  const conn = await prisma.platformConnection.findFirst({
    where: { clientId: ctx.clientId, platform: "ga4", isActive: true },
    include: { assets: { where: { assetType: "ga4_property" } } },
  });
  const prop = conn?.assets.find((a) => a.isSelected) ?? conn?.assets[0];
  if (!conn || !prop) return cache.data;
  let token: string;
  try { token = await getValidGoogleToken(conn); } catch { return cache.data; }
  const mode = ctx.clientType === "ecom" ? "ecom" : "leads";
  try { cache.data = await fetchAnalytics(prop.externalId, token, daysBetween(range.since, range.until), mode, { since: range.since, until: range.until }); } catch { cache.data = null; }
  return cache.data;
}

// ---------- bucketing ----------
function bucketKey(date: string, dim: Dimension): string {
  if (dim === "month") return date.slice(0, 7);
  if (dim === "week") {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day); // ראשון של אותו שבוע
    return d.toISOString().slice(0, 10);
  }
  return date;
}

// רכיבים מתוך שורות פלטפורמה
function rowsToComponents(platform: Platform, ad: AdRows, ctx: ClientCtx): Components {
  const c = zero();
  if (platform === "meta" || platform === "all") addInto(c, metaComp(ad.meta, ctx.metaConversionEvent));
  if (platform === "google_ads" || platform === "all") addInto(c, googleComp(ad.google, ctx.googleConversionAction));
  if (platform === "tiktok" || platform === "all") addInto(c, tiktokComp(ad.tiktok));
  return c;
}

/** סינון שורות פרסום לפי שם קמפיין (מכיל, מנורמל) — לווידג'טים פר-מוצר */
function filterAdRows(ad: AdRows, filter: string): AdRows {
  const f = normalizeName(filter);
  if (!f) return ad;
  return {
    meta: ad.meta.filter((r) => normalizeName(r.name).includes(f)),
    google: ad.google.filter((r) => normalizeName(r.campaignName).includes(f)),
    tiktok: ad.tiktok.filter((r) => normalizeName(r.campaignName).includes(f)),
  };
}

// ---------- חישוב ווידג'ט פרסום ----------
function computeAdWidget(w: WidgetConfig, ctx: ClientCtx, ad: AdRows, prevAd?: AdRows | null, customNames?: Map<string, string>, liveReach?: number | null): WidgetData {
  // סינון פר-מוצר/קמפיין — לפני כל חישוב (כולל ההשוואה לתקופה קודמת)
  if (w.campaignFilter) {
    ad = filterAdRows(ad, w.campaignFilter);
    if (prevAd) prevAd = filterAdRows(prevAd, w.campaignFilter);
  }

  // פילוח לפי סוג המרה — לא תלוי בבחירת מטריקות
  if (w.dimension === "action") return actionBreakdown(w, ctx, ad, customNames ?? new Map());

  const metrics = w.metrics.filter((m) => METRIC_BY_ID[m]?.platforms.includes(w.platform));
  if (metrics.length === 0) return { type: "empty", reason: "לא נבחרו מטריקות" };

  // KPI / ללא מימד — סכום על כל הטווח
  if (w.displayType === "kpi" || w.dimension === "none") {
    const c = rowsToComponents(w.platform, ad, ctx);
    const prev = w.compare && prevAd ? rowsToComponents(w.platform, prevAd, ctx) : null;
    // reach מדויק — שליפה חיה ברמת חשבון (רק ללא סינון קמפיין, שם הדדופ תקף)
    const useLiveReach = liveReach != null && !w.campaignFilter && (w.platform === "meta" || w.platform === "all");
    return {
      type: "kpi",
      metrics: metrics.map((id) => {
        const value = id === "reach" && useLiveReach ? liveReach! : metricValue(id, c);
        return { id, label: METRIC_BY_ID[id].label, value, unit: METRIC_BY_ID[id].unit, change: prev ? changePct(value, metricValue(id, prev)) : undefined };
      }),
    };
  }

  // פילוח לפי פלטפורמה (pie/bar כש-all)
  if (w.dimension === "platform") {
    const metricId = metrics[0];
    const plats: Platform[] = w.platform === "all" ? ["meta", "google_ads", "tiktok"] : [w.platform];
    const slices = plats.map((p) => ({ label: PLATFORM_LABELS[p], value: metricValue(metricId, rowsToComponents(p, ad, ctx)) })).filter((s) => s.value !== 0);
    if (w.displayType === "pie") return { type: "pie", metricId, label: METRIC_BY_ID[metricId].label, slices };
    return { type: "series", display: "bar", buckets: slices.map((s) => s.label), series: [{ id: metricId, label: METRIC_BY_ID[metricId].label, values: slices.map((s) => s.value) }] };
  }

  // טבלה לפי קמפיין
  if (w.dimension === "campaign" || w.displayType === "table") {
    // ב-"כל הפלטפורמות" ממפתחים לפי פלטפורמה+שם כדי שקמפיינים שונים בעלי אותו שם לא ימוזגו
    const isAll = w.platform === "all";
    const PLAT_LABEL: Record<string, string> = { meta: "Meta", google_ads: "Google", tiktok: "TikTok" };
    const map = new Map<string, { comp: Components; label: string }>();
    const bump = (plat: string, name: string, comp: Components) => {
      const key = isAll ? `${plat}|${name}` : name;
      const label = isAll ? `${PLAT_LABEL[plat]} · ${name}` : name;
      const e = map.get(key) ?? { comp: zero(), label };
      addInto(e.comp, comp); map.set(key, e);
    };
    if (w.platform === "meta" || w.platform === "all") {
      const byName = new Map<string, MetaRow[]>();
      for (const r of ad.meta) { const k = r.name || "(ללא שם)"; (byName.get(k) ?? byName.set(k, []).get(k)!).push(r); }
      for (const [name, rows] of byName) bump("meta", name, metaComp(rows, ctx.metaConversionEvent));
    }
    if (w.platform === "google_ads" || w.platform === "all") {
      const byName = new Map<string, GoogleRow[]>();
      for (const r of ad.google) { const k = r.campaignName || "(ללא שם)"; (byName.get(k) ?? byName.set(k, []).get(k)!).push(r); }
      for (const [name, rows] of byName) bump("google_ads", name, googleComp(rows, ctx.googleConversionAction));
    }
    if (w.platform === "tiktok" || w.platform === "all") {
      const byName = new Map<string, TiktokRow[]>();
      for (const r of ad.tiktok) { const k = r.campaignName || "(ללא שם)"; (byName.get(k) ?? byName.set(k, []).get(k)!).push(r); }
      for (const [name, rows] of byName) bump("tiktok", name, tiktokComp(rows));
    }
    const sortMetric = metrics[0];
    const entries = [...map.values()].sort((a, b) => metricValue(sortMetric, b.comp) - metricValue(sortMetric, a.comp)).slice(0, 20);
    return {
      type: "table",
      columns: [{ id: "name", label: "קמפיין" }, ...metrics.map((id) => ({ id, label: METRIC_BY_ID[id].label }))],
      rows: entries.map((e) => [e.label, ...metrics.map((id) => Math.round(metricValue(id, e.comp) * 100) / 100)]),
    };
  }

  // סדרת זמן (date/week/month) — line/area/bar
  const buckets = new Map<string, Components>();
  const accum = (rows: { date: string }[], comp: (group: typeof rows) => Components, dim: Dimension) => {
    const byBucket = new Map<string, typeof rows>();
    for (const r of rows) { const k = bucketKey(r.date, dim); (byBucket.get(k) ?? byBucket.set(k, []).get(k)!).push(r); }
    for (const [k, group] of byBucket) { const e = buckets.get(k) ?? zero(); addInto(e, comp(group)); buckets.set(k, e); }
  };
  if (w.platform === "meta" || w.platform === "all") accum(ad.meta, (g) => metaComp(g as MetaRow[], ctx.metaConversionEvent), w.dimension);
  if (w.platform === "google_ads" || w.platform === "all") accum(ad.google, (g) => googleComp(g as GoogleRow[], ctx.googleConversionAction), w.dimension);
  if (w.platform === "tiktok" || w.platform === "all") accum(ad.tiktok, (g) => tiktokComp(g as TiktokRow[]), w.dimension);

  const sortedKeys = [...buckets.keys()].sort();
  const display = w.displayType === "bar" ? "bar" : w.displayType === "area" ? "area" : "line";
  return {
    type: "series",
    display,
    buckets: sortedKeys,
    series: metrics.map((id) => ({ id, label: METRIC_BY_ID[id].label, values: sortedKeys.map((k) => Math.round(metricValue(id, buckets.get(k)!) * 100) / 100) })),
  };
}

// ---------- חישוב ווידג'ט GA4 ----------
const GA4_SUMMARY_KEY: Record<string, string> = {
  ga4_sessions: "sessions", ga4_users: "users", ga4_revenue: "revenue", ga4_transactions: "transactions", ga4_keyEvents: "keyEvents",
};
function ga4Value(id: string, summary: Record<string, number>): number {
  if (id === "ga4_convRate") return (summary.convRate ?? 0) * 100;
  return summary[GA4_SUMMARY_KEY[id]] ?? 0;
}
function computeGa4Widget(w: WidgetConfig, data: AnalyticsData | null, prevData?: AnalyticsData | null): WidgetData {
  if (!data) return { type: "empty", reason: "Google Analytics לא מחובר" };
  const metrics = w.metrics.filter((m) => METRIC_BY_ID[m]?.platforms.includes("ga4"));
  if (metrics.length === 0) return { type: "empty", reason: "לא נבחרו מטריקות" };

  if (w.displayType === "kpi" || w.dimension === "none") {
    return {
      type: "kpi",
      metrics: metrics.map((id) => {
        const value = ga4Value(id, data.summary);
        return { id, label: METRIC_BY_ID[id].label, value, unit: METRIC_BY_ID[id].unit, change: w.compare && prevData ? changePct(value, ga4Value(id, prevData.summary)) : undefined };
      }),
    };
  }
  if (w.displayType === "pie") {
    return { type: "pie", metricId: metrics[0], label: METRIC_BY_ID[metrics[0]].label, slices: data.channels.map((c) => ({ label: c.name, value: c.value })) };
  }
  if (w.displayType === "table") {
    return {
      type: "table",
      columns: [{ id: "name", label: data.mode === "ecom" ? "מוצר" : "דף נחיתה" }, { id: "primary", label: data.mode === "ecom" ? "הכנסה" : "סשנים" }, { id: "secondary", label: data.mode === "ecom" ? "יחידות" : "לידים" }],
      rows: data.items.map((it) => [it.name, Math.round(it.primary), Math.round(it.secondary)]),
    };
  }
  // line/area — סדרת זמן: סשנים מול המדד הראשי
  const display = w.displayType === "bar" ? "bar" : w.displayType === "area" ? "area" : "line";
  const wantsSessions = metrics.includes("ga4_sessions");
  const series = [{ id: "primary", label: data.mode === "ecom" ? "הכנסות" : "לידים", values: data.timeseries.map((t) => Math.round(t.primary * 100) / 100) }];
  if (wantsSessions) series.push({ id: "ga4_sessions", label: "סשנים", values: data.timeseries.map((t) => t.sessions) });
  return { type: "series", display, buckets: data.timeseries.map((t) => t.date), series };
}

// ---------- רשימת סוגי המרות זמינים (לבורר ה-UI של "לפי סוג המרה") ----------
export async function listConversionActions(
  ctx: ClientCtx,
  range: DateRange,
  opts?: { platform?: Platform; campaignFilter?: string },
): Promise<{ label: string; count: number }[]> {
  const adCache: AdCache = {};
  let ad = await getAdRows(ctx, range, adCache);
  if (opts?.campaignFilter) ad = filterAdRows(ad, opts.campaignFilter);
  const platform = opts?.platform ?? "all";
  const needsNames = platform === "meta" || platform === "all";
  const customNames = needsNames ? await resolveMetaCustomNames(ctx.clientId) : new Map<string, string>();
  return [...countActionTypes(platform, ad, customNames).entries()]
    .map(([label, count]) => ({ label, count: Math.round(count * 100) / 100 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ---------- ציבורי ----------
export async function loadClientCtx(clientId: string): Promise<ClientCtx | null> {
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { currency: true, clientType: true, metaConversionEvent: true, googleConversionAction: true } });
  if (!c) return null;
  return { clientId, currency: c.currency || "ILS", clientType: c.clientType || "לידים", metaConversionEvent: c.metaConversionEvent || "", googleConversionAction: c.googleConversionAction || "" };
}

// ---------- snapshot — סיכום מספרי קומפקטי להקשר AI / השוואת תקופות ----------
export interface PlatformSnapshot { spend: number; impressions: number; clicks: number; conversions: number; purchaseValue: number; cpa: number; roas: number; ctr: number }
export interface Snapshot {
  range: DateRange;
  ad: { all: PlatformSnapshot; meta: PlatformSnapshot; google: PlatformSnapshot; tiktok: PlatformSnapshot };
  ga4: { mode: string; summary: Record<string, number>; topChannels: { name: string; value: number }[]; topItems: { name: string; primary: number }[] } | null;
}
const snap = (c: Components): PlatformSnapshot => ({
  spend: c.spend, impressions: c.impressions, clicks: c.clicks, conversions: c.conversions, purchaseValue: c.purchaseValue,
  cpa: metricValue("cpa", c), roas: metricValue("roas", c), ctr: metricValue("ctr", c),
});

export async function computeSnapshot(ctx: ClientCtx, range: DateRange): Promise<Snapshot> {
  const adCache: AdCache = {};
  const ga4Cache: Ga4Cache = { loaded: false, data: null };
  const [ad, ga4] = await Promise.all([getAdRows(ctx, range, adCache), getGa4(ctx, range, ga4Cache)]);
  return {
    range,
    ad: {
      all: snap(rowsToComponents("all", ad, ctx)),
      meta: snap(rowsToComponents("meta", ad, ctx)),
      google: snap(rowsToComponents("google_ads", ad, ctx)),
      tiktok: snap(rowsToComponents("tiktok", ad, ctx)),
    },
    ga4: ga4 ? { mode: ga4.mode, summary: ga4.summary, topChannels: ga4.channels.slice(0, 5).map((c) => ({ name: c.name, value: c.value })), topItems: ga4.items.slice(0, 5).map((i) => ({ name: i.name, primary: i.primary })) } : null,
  };
}

export async function computeDashboard(widgets: WidgetConfig[], ctx: ClientCtx, range: DateRange): Promise<{ widgetId: string; data: WidgetData }[]> {
  const adCache: AdCache = {};
  const ga4Cache: Ga4Cache = { loaded: false, data: null };
  const prevAdCache: AdCache = {};
  const prevGa4Cache: Ga4Cache = { loaded: false, data: null };

  const dataWidgets = widgets.filter((w) => !isText(w) && !isSegment(w) && !isSearchTerm(w));
  const needsAd = dataWidgets.some((w) => w.platform !== "ga4");
  const needsGa4 = dataWidgets.some((w) => w.platform === "ga4");
  const needsCompare = dataWidgets.some(wantsCompare);
  const prev = needsCompare ? previousRange(range) : null;
  const emptyAd: AdRows = { meta: [], google: [], tiktok: [] };

  // פילוחים דמוגרפיים — שליפה חיה מ-Google Ads (קריאה אחת לכל פילוח)
  const segCache = new Map<string, SegmentRow[]>();
  const segDims = [...new Set(widgets.filter(isSegment).map((w) => w.dimension))];

  // מונחי חיפוש — שליפה מה-DB לכל צירוף (campaignFilter). מפתח ריק = כל הקמפיינים.
  const stCache = new Map<string, SearchTermAgg[]>();
  const stKeys = [...new Set(widgets.filter(isSearchTerm).map((w) => w.campaignFilter ?? ""))];

  // שמות המרות מותאמות של מטא — רק אם יש ווידג'ט "לפי סוג המרה" בהיקף מטא
  const needsActionNames = dataWidgets.some((w) => w.dimension === "action" && (w.platform === "meta" || w.platform === "all"));
  let customNames = new Map<string, string>();

  // Reach חי — רק אם יש KPI מטא/הכל שמבקש reach בלי סינון קמפיין
  const needsReach = dataWidgets.some((w) => (w.platform === "meta" || w.platform === "all") && (w.displayType === "kpi" || w.dimension === "none") && !w.campaignFilter && w.metrics.includes("reach"));
  let liveReach: number | null = null;

  const [ad, , prevAd] = await Promise.all([
    needsAd ? getAdRows(ctx, range, adCache) : Promise.resolve(emptyAd),
    needsGa4 ? getGa4(ctx, range, ga4Cache) : Promise.resolve(null),
    needsCompare && needsAd && prev ? getAdRows(ctx, prev, prevAdCache) : Promise.resolve(emptyAd),
    needsCompare && needsGa4 && prev ? getGa4(ctx, prev, prevGa4Cache) : Promise.resolve(null),
    ...segDims.map(async (d) => { segCache.set(d, await fetchGoogleSegment(ctx.clientId, range.since, range.until, d as GoogleSegment)); }),
    ...stKeys.map(async (k) => { stCache.set(k, await fetchSearchTerms(ctx, range, k || undefined)); }),
    ...(needsActionNames ? [resolveMetaCustomNames(ctx.clientId).then((m) => { customNames = m; })] : []),
    ...(needsReach ? [fetchAccountReach(ctx.clientId, range).then((v) => { liveReach = v; })] : []),
  ]);

  return widgets.map((w) => {
    let data: WidgetData;
    if (isText(w)) data = { type: "text", heading: w.displayType === "heading", body: w.textBody };
    else if (isSegment(w)) data = segmentToData(w, segCache.get(w.dimension) ?? []);
    else if (isSearchTerm(w)) data = searchTermToData(w, stCache.get(w.campaignFilter ?? "") ?? []);
    else if (w.platform === "ga4") data = computeGa4Widget(w, ga4Cache.data, prevGa4Cache.data);
    else data = computeAdWidget(w, ctx, ad, prevAd, customNames, liveReach);
    return { widgetId: w.id, data };
  });
}
