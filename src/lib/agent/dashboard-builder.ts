// בונה דשבורד חכם — מתרגם את פרופיל העסק (ליבת-הידע) לסט ווידג'טים מוכן.
// זה החיבור בין "המוח" של הסוכן (business-knowledge + funnel-detect) לבין
// הדשבורד הציבורי: סוג העסק קובע את כוכב הצפון, המשפך קובע את המדדים,
// והפלטפורמות הפעילות קובעות אילו סקשנים נבנים.

import { prisma } from "@/lib/db/prisma";
import { classifyBusinessType, type BusinessType } from "./business-knowledge";
import { normalizeName } from "@/lib/reports/group-by-product";
import { shiftYmd, todayIL } from "@/lib/utils/ildate";

/** הגדרת ווידג'ט לבנייה (שדות DashboardWidget הרלוונטיים) */
interface WidgetSpec {
  platform: string;
  metrics: string[];
  displayType: string;
  dimension: string;
  size: string;
  title: string;
  textBody?: string;
  compare?: boolean;
  /** סינון לפי שם קמפיין — לסקשנים פר-מוצר */
  campaignFilter?: string;
}

/** אילו פלטפורמות פעילות ללקוח (יש דאטה ב-30 הימים האחרונים) */
async function getActivePlatforms(clientId: string): Promise<Array<"meta" | "google_ads" | "tiktok">> {
  const since = shiftYmd(todayIL(), -30);
  const [meta, google, tiktok] = await Promise.all([
    prisma.metaInsightDaily.count({ where: { clientId, level: "campaign", date: { gte: since }, spend: { gt: 0 } } }),
    prisma.googleAdsInsightDaily.count({ where: { clientId, date: { gte: since }, spend: { gt: 0 } } }),
    prisma.tikTokInsightDaily.count({ where: { clientId, date: { gte: since }, spend: { gt: 0 } } }),
  ]);
  const active: Array<"meta" | "google_ads" | "tiktok"> = [];
  if (meta > 0) active.push("meta");
  if (google > 0) active.push("google_ads");
  if (tiktok > 0) active.push("tiktok");
  return active;
}

// ---------- חילוץ מוצרים משמות קמפיינים (כשאין מוצרים בפרופיל) ----------
// גנרי לכל לקוח: מפצל שם-קמפיין לסגמנטים (לפי "|"), מזהה את הסגמנט הכי
// ייחודי (התדירות הנמוכה ביותר על-פני הקמפיינים) — זהו המוצר. סגמנטים חוזרים
// (Nova / Lead Gen / B2B / שם-הסוכנות) הם boilerplate בתדירות גבוהה ומסוננים.
const DATE_SEG = /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/;
function splitSegments(name: string): string[] {
  return name.split("|").map((s) => s.trim()).filter((s) => s && !DATE_SEG.test(s));
}

/** מחלץ שמות מוצר מובחנים מרשימת שמות-קמפיינים (מבוסס-תדירות, ללא hardcode) */
export function extractProductsFromNames(names: string[]): string[] {
  const clean = names.filter(Boolean);
  if (clean.length < 2) return [];
  // תדירות כל סגמנט (מנורמל) על-פני הקמפיינים
  const freq = new Map<string, number>();
  const parsed = clean.map((n) => {
    const seen = new Map<string, string>(); // norm → raw (ייצוג אחד לכל סגמנט בקמפיין)
    for (const raw of splitSegments(n)) { const norm = normalizeName(raw); if (norm && !seen.has(norm)) seen.set(norm, raw); }
    for (const norm of seen.keys()) freq.set(norm, (freq.get(norm) ?? 0) + 1);
    return [...seen.entries()].map(([norm, raw]) => ({ norm, raw }));
  });
  const products = new Set<string>();
  for (const segs of parsed) {
    if (!segs.length) continue;
    // המובחן ביותר: תדירות מינימלית; שובר-שוויון = הסגמנט הארוך יותר
    const best = segs.slice().sort((a, b) => (freq.get(a.norm)! - freq.get(b.norm)!) || (b.raw.length - a.raw.length))[0];
    // מתעלמים מסגמנט שמופיע כמעט בכל הקמפיינים (boilerplate טהור, לא מוצר)
    if (best && freq.get(best.norm)! <= Math.max(2, Math.ceil(clean.length * 0.6))) products.add(best.raw);
  }
  return [...products].slice(0, 20);
}

/** מוצרים פעילים ללקוח — קודם מהפרופיל, ואם ריק: חילוץ משמות הקמפיינים */
async function getDeepProducts(clientId: string): Promise<string[]> {
  const fromProfile = await getActiveProducts(clientId);
  if (fromProfile.length > 0) return fromProfile;
  const since = shiftYmd(todayIL(), -30);
  const camps = await prisma.metaInsightDaily.findMany({
    where: { clientId, level: "campaign", date: { gte: since }, spend: { gt: 0 } },
    select: { name: true }, distinct: ["name"],
  });
  return extractProductsFromNames(camps.map((c) => c.name));
}

/**
 * מוצרים מהפרופיל שיש להם קמפיין תואם ב-30 הימים האחרונים (התאמת שם-מכיל,
 * כמו בדוח השבועי). רק להם נבנה סקשן — בלי סקשנים ריקים.
 */
async function getActiveProducts(clientId: string): Promise<string[]> {
  const profile = await prisma.clientProfile.findUnique({ where: { clientId }, select: { products: true } });
  let products: Array<{ name?: string }> = [];
  try { products = JSON.parse(profile?.products || "[]"); } catch { /* פרופיל בלי מוצרים */ }
  const names = products.map((p) => (p.name ?? "").trim()).filter(Boolean);
  if (names.length === 0) return [];

  const since = shiftYmd(todayIL(), -30);
  const [meta, google, tiktok] = await Promise.all([
    prisma.metaInsightDaily.findMany({ where: { clientId, level: "campaign", date: { gte: since } }, select: { name: true }, distinct: ["name"] }),
    prisma.googleAdsInsightDaily.findMany({ where: { clientId, date: { gte: since } }, select: { campaignName: true }, distinct: ["campaignName"] }),
    prisma.tikTokInsightDaily.findMany({ where: { clientId, date: { gte: since } }, select: { campaignName: true }, distinct: ["campaignName"] }),
  ]);
  const campaignNames = [
    ...meta.map((r) => r.name),
    ...google.map((r) => r.campaignName),
    ...tiktok.map((r) => r.campaignName),
  ].map(normalizeName);

  return names.filter((p) => {
    const np = normalizeName(p);
    return campaignNames.some((c) => c.includes(np));
  }).slice(0, 10); // רף שפיות — עד 10 סקשני מוצר
}

/** מתכון הווידג'טים לפי סוג העסק, הפלטפורמות הפעילות והמוצרים */
function buildRecipe(type: BusinessType, clientName: string, platforms: string[], products: string[]): WidgetSpec[] {
  const specs: WidgetSpec[] = [];
  const isEcom = type === "ecommerce";

  // מדדי כוכב-הצפון: איקומרס=הכנסה+ROAS, לידים=המרות+עלות להמרה
  const kpiMetrics = isEcom ? ["spend", "purchaseValue", "roas"] : ["spend", "conversions", "cpa"];
  const resultLabel = isEcom ? "רכישות" : "לידים";

  // 1) כותרת פתיחה
  specs.push({ platform: "all", metrics: [], displayType: "heading", dimension: "none", size: "full", title: `תמונת מצב — ${clientName}` });

  // 2) שורת KPI ראשית עם השוואה לתקופה קודמת
  specs.push({ platform: "all", metrics: kpiMetrics, displayType: "kpi", dimension: "none", size: "full", title: "סיכום כולל", compare: true });

  // 3) גרפים — מגמה יומית של הוצאה ותוצאה
  specs.push({ platform: "all", metrics: ["spend"], displayType: "line", dimension: "date", size: "half", title: "הוצאה יומית" });
  specs.push({
    platform: "all",
    metrics: isEcom ? ["purchaseValue"] : ["conversions"],
    displayType: "line",
    dimension: "date",
    size: "half",
    title: isEcom ? "הכנסות לאורך זמן" : `${resultLabel} לאורך זמן`,
  });

  // 4) חלוקת תקציב בין פלטפורמות — רק אם יש יותר מפלטפורמה אחת
  if (platforms.length > 1) {
    specs.push({ platform: "all", metrics: ["spend"], displayType: "pie", dimension: "platform", size: "half", title: "חלוקת תקציב בין פלטפורמות" });
    specs.push({
      platform: "all",
      metrics: isEcom ? ["purchaseValue"] : ["conversions"],
      displayType: "pie",
      dimension: "platform",
      size: "half",
      title: `${isEcom ? "הכנסות" : resultLabel} לפי פלטפורמה`,
    });
  }

  // 5) פילוח סוגי המרות — "מה קרה בפועל" בשפת בעל העסק (טופס/שיחה/פגישה/רכישה)
  specs.push({ platform: "all", metrics: ["conversions"], displayType: "pie", dimension: "action", size: "half", title: "סוגי המרות" });
  specs.push({ platform: "all", metrics: ["conversions"], displayType: "table", dimension: "action", size: "half", title: "עלות לפי סוג המרה" });

  // 6) טבלת קמפיינים
  specs.push({
    platform: "all",
    metrics: isEcom ? ["spend", "conversions", "purchaseValue", "roas"] : ["spend", "conversions", "cpa"],
    displayType: "table",
    dimension: "campaign",
    size: "full",
    title: "פירוט קמפיינים",
  });

  // 7) סקשן לכל מוצר — כמו בכלי הישן של הסוכנות: כותרת מוצר + KPI מסונן לקמפיינים
  //    של המוצר + טבלת הקמפיינים שלו + פילוח סוגי ההמרות שלו
  for (const product of products) {
    specs.push({ platform: "all", metrics: [], displayType: "heading", dimension: "none", size: "full", title: product });
    specs.push({ platform: "all", metrics: kpiMetrics, displayType: "kpi", dimension: "none", size: "full", title: "", compare: true, campaignFilter: product });
    specs.push({
      platform: "all",
      metrics: isEcom ? ["spend", "conversions", "roas"] : ["spend", "conversions", "cpa"],
      displayType: "table",
      dimension: "campaign",
      size: "half",
      title: "קמפיינים",
      campaignFilter: product,
    });
    specs.push({ platform: "all", metrics: ["conversions"], displayType: "pie", dimension: "action", size: "half", title: "סוגי המרות", campaignFilter: product });
  }

  // 8) סקשן לכל פלטפורמה פעילה — לוגו + KPI (+דמוגרפיה בגוגל)
  for (const p of platforms) {
    specs.push({ platform: p, metrics: [], displayType: "platform_header", dimension: "none", size: "full", title: "" });
    // purchaseValue/roas זמינים רק במטא — בשאר הפלטפורמות נציג עלות להמרה
    const pMetrics = isEcom && p === "meta" ? ["spend", "purchaseValue", "roas"] : ["spend", "conversions", "cpa"];
    specs.push({ platform: p, metrics: pMetrics, displayType: "kpi", dimension: "none", size: "full", title: "", compare: true });
    // גוגל — פילוחי דמוגרפיה חיים (גיל/מגדר/מכשיר) כמו שהלקוחות רגילים מהכלים הישנים
    if (p === "google_ads") {
      specs.push({ platform: p, metrics: ["conversions"], displayType: "pie", dimension: "age", size: "third", title: "המרות לפי גיל" });
      specs.push({ platform: p, metrics: ["conversions"], displayType: "pie", dimension: "gender", size: "third", title: "המרות לפי מגדר" });
      specs.push({ platform: p, metrics: ["conversions"], displayType: "pie", dimension: "device", size: "third", title: "המרות לפי מכשיר" });
    }
  }

  return specs;
}

/**
 * מתכון "עמוק" בסגנון הכלים הישנים (Alma/Oviond): סקשן FB עשיר + סקשן מפורט
 * לכל מוצר (7 KPI + לידים לפי גיל/מכשיר + מגמת לידים ועלות + טבלאות
 * קמפיינים/קהלים/מודעות) + סיכום Google. מבוסס על אבני-הבניין: פילוח דמוגרפי
 * מטא, טבלאות adset/ad, ומטריקות leads/cpl/cplc. גנרי לכל לקוח.
 */
function buildDeepRecipe(type: BusinessType, clientName: string, platforms: string[], products: string[]): WidgetSpec[] {
  const specs: WidgetSpec[] = [];
  const isEcom = type === "ecommerce";
  const hasMeta = platforms.includes("meta");
  const hasGoogle = platforms.includes("google_ads");
  // מדד ה"תוצאה" הדמוגרפי: לידים לעסק-לידים, המרות (=רכישות) לאיקומרס
  const resultMetric = isEcom ? "conversions" : "leads";
  const resultWord = isEcom ? "המרות" : "לידים";

  specs.push({ platform: "all", metrics: [], displayType: "heading", dimension: "none", size: "full", title: `תמונת מצב — ${clientName}` });

  // ===== סקשן Meta (פייסבוק) — סיכום עשיר =====
  if (hasMeta) {
    specs.push({ platform: "meta", metrics: [], displayType: "platform_header", dimension: "none", size: "full", title: "" });
    const summaryKpi = isEcom
      ? ["spend", "purchaseValue", "roas", "conversions", "cpa", "impressions", "ctr", "reach"]
      : ["cplc", "linkClicks", "reach", "impressions", "spend", "leads", "cpl", "ctr"];
    specs.push({ platform: "meta", metrics: summaryKpi, displayType: "kpi", dimension: "none", size: "full", title: "סיכום פייסבוק", compare: true });
    specs.push({ platform: "meta", metrics: [resultMetric], displayType: "line", dimension: "date", size: "full", title: `${resultWord} לפי יום` });
    specs.push({ platform: "meta", metrics: ["impressions", "clicks", "ctr"], displayType: "table", dimension: "campaign", size: "full", title: "ביצועים לפי קמפיין" });
  }

  // ===== סקשן מפורט לכל מוצר (Meta) =====
  const productKpi = isEcom
    ? ["spend", "purchaseValue", "roas", "conversions", "cpa", "ctr", "clicks"]
    : ["cpc", "ctr", "clicks", "impressions", "spend", "cpl", "leads"];
  const creativeCols = isEcom ? ["spend", "conversions", "cpa"] : ["spend", "leads", "cpl"];
  if (hasMeta) {
    for (const product of products) {
      specs.push({ platform: "all", metrics: [], displayType: "heading", dimension: "none", size: "full", title: product });
      specs.push({ platform: "meta", metrics: productKpi, displayType: "kpi", dimension: "none", size: "full", title: "", compare: true, campaignFilter: product });
      specs.push({ platform: "meta", metrics: [resultMetric], displayType: "pie", dimension: "age", size: "half", title: `${resultWord} לפי גיל`, campaignFilter: product });
      specs.push({ platform: "meta", metrics: [resultMetric], displayType: "pie", dimension: "device", size: "half", title: `${resultWord} לפי מכשיר`, campaignFilter: product });
      // שני גרפים נפרדים (סקאלות שונות): מגמת התוצאה + מגמת העלות-לתוצאה
      specs.push({ platform: "meta", metrics: [resultMetric], displayType: "line", dimension: "date", size: "half", title: `${resultWord} לאורך זמן`, campaignFilter: product });
      specs.push({ platform: "meta", metrics: isEcom ? ["cpa"] : ["cpl"], displayType: "line", dimension: "date", size: "half", title: `עלות ל${isEcom ? "המרה" : "ליד"} לאורך זמן`, campaignFilter: product });
      specs.push({ platform: "meta", metrics: ["impressions", "clicks", "ctr"], displayType: "table", dimension: "campaign", size: "full", title: "קמפיינים", campaignFilter: product });
      specs.push({ platform: "meta", metrics: ["impressions", "clicks", "ctr"], displayType: "table", dimension: "adset", size: "full", title: "קהלים", campaignFilter: product });
      specs.push({ platform: "meta", metrics: creativeCols, displayType: "table", dimension: "ad", size: "full", title: "מודעות", campaignFilter: product });
    }
  }

  // ===== סקשן Google — סיכום =====
  if (hasGoogle) {
    specs.push({ platform: "google_ads", metrics: [], displayType: "platform_header", dimension: "none", size: "full", title: "" });
    specs.push({ platform: "google_ads", metrics: ["spend", "conversions", "cpa"], displayType: "kpi", dimension: "none", size: "full", title: "סיכום Google", compare: true });
    specs.push({ platform: "google_ads", metrics: ["conversions"], displayType: "pie", dimension: "action", size: "half", title: "סוגי המרות" });
    specs.push({ platform: "google_ads", metrics: ["conversions"], displayType: "line", dimension: "date", size: "half", title: "המרות לאורך זמן" });
    specs.push({ platform: "google_ads", metrics: ["spend", "conversions", "cpa"], displayType: "table", dimension: "campaign", size: "full", title: "קמפיינים (Google)" });
  }

  return specs;
}

/**
 * בונה דשבורד חכם ללקוח: ClientReport חדש + סט ווידג'טים שנגזר מפרופיל העסק.
 * variant "deep" — מבנה עשיר בסגנון הכלים הישנים (פר-מוצר עם דמוגרפיה+קהלים+מודעות).
 * מחזיר את הדוח שנוצר.
 */
export async function buildSmartDashboard(clientId: string, opts: { variant?: "standard" | "deep" } = {}) {
  const variant = opts.variant ?? "standard";
  const [client, platforms, products] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true, clientType: true } }),
    getActivePlatforms(clientId),
    variant === "deep" ? getDeepProducts(clientId) : getActiveProducts(clientId),
  ]);
  if (!client) throw new Error("לקוח לא נמצא");

  const type = classifyBusinessType(client.clientType);
  const specs = variant === "deep"
    ? buildDeepRecipe(type, client.name, platforms, products)
    : buildRecipe(type, client.name, platforms, products);

  const count = await prisma.clientReport.count({ where: { clientId } });
  const report = await prisma.clientReport.create({
    data: { clientId, name: variant === "deep" ? "דשבורד מפורט" : "דשבורד חכם", sortOrder: count },
  });

  await prisma.dashboardWidget.createMany({
    data: specs.map((s, i) => ({
      clientId,
      reportId: report.id,
      sortOrder: i,
      platform: s.platform,
      dataLevel: "campaign",
      metrics: JSON.stringify(s.metrics),
      dimension: s.dimension,
      filters: s.campaignFilter ? JSON.stringify([{ field: "campaign", operator: "contains", value: s.campaignFilter }]) : "[]",
      displayType: s.displayType,
      size: s.size,
      title: s.title,
      textBody: s.textBody ?? "",
      compare: s.compare ?? false,
    })),
  });

  return { report, widgetCount: specs.length, businessType: type, platforms, products, variant };
}
