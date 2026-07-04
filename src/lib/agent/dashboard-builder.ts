// בונה דשבורד חכם — מתרגם את פרופיל העסק (ליבת-הידע) לסט ווידג'טים מוכן.
// זה החיבור בין "המוח" של הסוכן (business-knowledge + funnel-detect) לבין
// הדשבורד הציבורי: סוג העסק קובע את כוכב הצפון, המשפך קובע את המדדים,
// והפלטפורמות הפעילות קובעות אילו סקשנים נבנים.

import { prisma } from "@/lib/db/prisma";
import { classifyBusinessType, type BusinessType } from "./business-knowledge";
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

/** מתכון הווידג'טים לפי סוג העסק והפלטפורמות הפעילות */
function buildRecipe(type: BusinessType, clientName: string, platforms: string[]): WidgetSpec[] {
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

  // 7) סקשן לכל פלטפורמה פעילה — לוגו + KPI (+דמוגרפיה בגוגל)
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
 * בונה דשבורד חכם ללקוח: ClientReport חדש + סט ווידג'טים שנגזר מפרופיל העסק.
 * מחזיר את הדוח שנוצר.
 */
export async function buildSmartDashboard(clientId: string) {
  const [client, platforms] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { name: true, clientType: true } }),
    getActivePlatforms(clientId),
  ]);
  if (!client) throw new Error("לקוח לא נמצא");

  const type = classifyBusinessType(client.clientType);
  const specs = buildRecipe(type, client.name, platforms);

  const count = await prisma.clientReport.count({ where: { clientId } });
  const report = await prisma.clientReport.create({
    data: { clientId, name: "דשבורד חכם", sortOrder: count },
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
      filters: "[]",
      displayType: s.displayType,
      size: s.size,
      title: s.title,
      textBody: s.textBody ?? "",
      compare: s.compare ?? false,
    })),
  });

  return { report, widgetCount: specs.length, businessType: type, platforms };
}
