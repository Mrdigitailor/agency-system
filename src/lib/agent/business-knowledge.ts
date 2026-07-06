// ליבת-הידע של סוכן הדוחות והדשבורדים (Mr.digitailor).
// זהו "המוח" של הסוכן: איך להבין עסק, אילו מדדים מובילים לפי סוג העסק,
// ואיך לפרש אותם ללקוח הקצה. מקור-אמת יחיד שגם מחולל הדוחות וגם קונפיגורציית
// הדשבורד צורכים ממנו — כדי שכולם "חושבים" על העסק אותו הדבר.
//
// שלושה מזלגות שקובעים את הטקסונומיה:
//   1. סוג עסק:        איקומרס | לידים
//   2. (רק לידים) משפך: דף נחיתה/אתר | טופס בפלטפורמה
//   3. גישת CRM:        אין | מחובר   → קובע עד איזו דרגה במשפך אפשר לדווח

// ==================== טיפוסים ====================

export type BusinessType = "ecommerce" | "leads";
/**
 * תת-מזלג ללידים: דף נחיתה/אתר, טופס לידים ישיר בפלטפורמה, או שניהם.
 * מזוהה אוטומטית מסריקת חשבון המודעות (ר' funnel-detect.ts) — לא הגדרה ידנית.
 */
export type LeadFunnel = "landing_page" | "native_form" | "both";
/** האם יש גישה ל-CRM של הלקוח (סגירות בפועל, ROAS אמיתי) */
export type CrmAccess = "none" | "connected";

/** שלב במשפך — לצורך סידור המדדים מלמעלה למטה */
export type FunnelStage = "reach" | "landing" | "cart" | "checkout" | "result" | "crm";

/**
 * מקור הנתון:
 *  - column:      עמודה קיימת ב-MetaInsightDaily / *InsightDaily
 *  - derived:     מחושב מעמודות (למשל costPerLead = spend/leads)
 *  - actionsJson: קיים בדאטה הגולמית אבל עדיין לא נחשף כעמודה/מדד נבחר
 *  - crm:         דורש גישה ל-CRM של הלקוח (לא קיים בפלטפורמה)
 */
export type MetricSource = "column" | "derived" | "actionsJson" | "crm";

export interface TaxonomyMetric {
  /** מזהה לוגי (יתחבר למפתחות ב-metrics.ts / actionsJson) */
  key: string;
  /** תווית בעברית להצגה */
  label: string;
  stage: FunnelStage;
  source: MetricSource;
  /** כוכב הצפון של סוג העסק — המדד שהסוכן מוביל איתו */
  northStar?: boolean;
}

export interface BusinessProfile {
  type: BusinessType;
  /** רלוונטי רק כש-type === "leads" */
  leadFunnel?: LeadFunnel;
  crm?: CrmAccess;
}

// ==================== טקסונומיית המדדים ====================
// כל מדד ממופה לשלב במשפך, לסוג העסק, ולמקור הנתון.
// "קיים" = column/derived → אפשר להציג היום. "actionsJson"/"crm" = building block עתידי.

/** מדדים משותפים לכל סוגי העסק — שלב החשיפה */
const REACH_METRICS: TaxonomyMetric[] = [
  { key: "impressions", label: "הופעות", stage: "reach", source: "column" },
  { key: "clicks", label: "קליקים", stage: "reach", source: "column" },
  { key: "ctr", label: "אחוז הקלקה (CTR)", stage: "reach", source: "column" },
  { key: "cpc", label: "עלות לקליק (CPC)", stage: "reach", source: "column" },
  { key: "cpm", label: "עלות ל-1000 חשיפות (CPM)", stage: "reach", source: "column" },
  { key: "frequency", label: "תדירות (Frequency)", stage: "reach", source: "column" },
];

/** שכבת CRM — נחשפת רק אם crm === "connected" */
const CRM_METRICS: Record<BusinessType, TaxonomyMetric[]> = {
  leads: [
    { key: "qualifiedLeads", label: "לידים איכותיים", stage: "crm", source: "crm" },
    { key: "closeRate", label: "אחוז סגירה", stage: "crm", source: "crm" },
    { key: "costPerSale", label: "עלות למכירה", stage: "crm", source: "crm" },
    { key: "trueRoas", label: "ROAS אמיתי", stage: "crm", source: "crm" },
  ],
  ecommerce: [
    { key: "trueRoas", label: "ROAS אמיתי (מול פיקסל)", stage: "crm", source: "crm" },
    { key: "returningCustomers", label: "לקוחות חוזרים", stage: "crm", source: "crm" },
  ],
};

/** בונה את רשימת המדדים המסודרת (מלמעלה למטה) לפי הפרופיל */
export function taxonomyFor(p: BusinessProfile): TaxonomyMetric[] {
  const metrics: TaxonomyMetric[] = [...REACH_METRICS];

  if (p.type === "ecommerce") {
    metrics.push(
      { key: "landingPageViews", label: "צפיות בדף נחיתה", stage: "landing", source: "column" },
      { key: "costPerLandingPageView", label: "עלות לצפייה בדף", stage: "landing", source: "derived" },
      { key: "addToCart", label: "הוספות לעגלה", stage: "cart", source: "actionsJson" },
      { key: "costPerAddToCart", label: "עלות להוספה לעגלה", stage: "cart", source: "derived" },
      { key: "initiateCheckout", label: "הגעות לצ'קאאוט", stage: "checkout", source: "actionsJson" },
      { key: "cartAbandonRate", label: "נטישה עגלה→צ'קאאוט", stage: "checkout", source: "derived" },
      { key: "checkoutAbandonRate", label: "נטישה צ'קאאוט→רכישה", stage: "result", source: "derived" },
      { key: "purchases", label: "רכישות", stage: "result", source: "column" },
      { key: "convRate", label: "אחוז המרה", stage: "result", source: "derived" },
      { key: "costPerConversion", label: "עלות לרכישה (CPA)", stage: "result", source: "column" },
      { key: "purchaseValue", label: "הכנסה", stage: "result", source: "column" },
      { key: "aov", label: "ערך הזמנה ממוצע (AOV)", stage: "result", source: "derived" },
      { key: "roas", label: "ROAS", stage: "result", source: "column", northStar: true },
    );
  } else {
    // לידים — המשפך יכול להיות דף נחיתה, טופס בפלטפורמה, או שניהם ("גם וגם")
    const funnel = p.leadFunnel ?? "landing_page";
    const hasLP = funnel === "landing_page" || funnel === "both";
    const hasForm = funnel === "native_form" || funnel === "both";

    if (hasLP) {
      metrics.push(
        { key: "linkClicks", label: "לחיצות על קישור", stage: "reach", source: "column" },
        { key: "costPerLinkClick", label: "עלות ללחיצה על קישור", stage: "reach", source: "derived" },
        { key: "landingPageViews", label: "טעינות דף נחיתה", stage: "landing", source: "column" },
      );
    }
    if (hasForm) {
      metrics.push({ key: "formOpens", label: "פתיחות טופס", stage: "landing", source: "actionsJson" });
    }
    const convLabel =
      funnel === "both" ? "אחוז המרה" : funnel === "native_form" ? "אחוז המרה (טופס→ליד)" : "אחוז המרה (דף→ליד)";
    metrics.push(
      { key: "leads", label: "לידים", stage: "result", source: "column" },
      { key: "convRate", label: convLabel, stage: "result", source: "derived" },
      { key: "costPerLead", label: "עלות לליד (CPL)", stage: "result", source: "column", northStar: true },
    );
  }

  if (p.crm === "connected") {
    metrics.push(...CRM_METRICS[p.type]);
  }

  return metrics;
}

/** כוכב הצפון — המדד שהסוכן שם במרכז ובונה עליו את המשפט הראשון */
export function northStarMetric(p: BusinessProfile): TaxonomyMetric {
  const star = taxonomyFor(p).find((m) => m.northStar);
  // בטחון: אם מסיבה כלשהי אין northStar, נחזור למדד תוצאה סביר
  return star ?? { key: "costPerConversion", label: "עלות להמרה", stage: "result", source: "column", northStar: true };
}

// ==================== סיווג מתוך נתוני הלקוח ====================

/** ממפה את Client.clientType (מחרוזת חופשית/עברית) לסוג עסק תקני */
export function classifyBusinessType(clientType: string | null | undefined): BusinessType {
  const t = (clientType ?? "").toLowerCase();
  if (t.includes("ecom") || t.includes("קומרס") || t.includes("חנות") || t.includes("shop")) {
    return "ecommerce";
  }
  return "leads"; // ברירת מחדל — רוב הלקוחות
}

// ==================== פרוטוקול האבחון ====================
// הידע שמנחה את הסוכן איך "להיכנס לראש" של בעל העסק בשלב ההיכרות.

export const DIAGNOSIS_PROTOCOL = `**פרוטוקול אבחון עסק (הבנה עסקית):**
1. מזלג-על: זהה קודם כל אם זה עסק *איקומרס* או *לידים* — זה קובע אילו מדדים בכלל רלוונטיים.
2. כלכלת העסק: מוצרים/קווי-מוצר, עלויות, שולי רווח, אחוז סגירה, אחוז המרת דף נחיתה.
3. היסטוריה וכאב: מה עבד/נכשל בעבר, האם פרסם קודם, ולמה עזב סוכנות קודמת (= החרדה שצריך להרגיע).
4. גישת-דאטה: האם יש גישה ל-CRM? זה קובע עד איזו דרגה במשפך אפשר לדווח (עד ליד/רכישה, או עד סגירה בפועל).
5. פירוק היררכי מהשמות: קמפיין→מוצר, קבוצת מודעות→קהל, מודעה→קריאייטיב.`;

// ==================== כללי מחולל התובנות ====================

export const INSIGHT_RULES = `**כללי כתיבת התובנות (להיכנס לראש של בעל העסק):**
- תרגם מספרים למשמעות בשפה של בעל העסק — לא ז'רגון מדיה פנימי.
- הובל תמיד עם *כוכב הצפון* של סוג העסק: לידים → עלות לליד וכמות לידים; איקומרס → ROAS והכנסה.
- אל תציג מדדים שלא רלוונטיים לסוג העסק (למשל ROAS ללקוח לידים בלי גישה ל-CRM).
- בלי גישה ל-CRM: עצור בשורת ההמרה שהפלטפורמה יודעת עליה (ליד/רכישה). אל תמציא סגירות או ROAS אמיתי.
- כל מדד מוצג עם כיוון מול תקופת ההשוואה (↑/↓) ובאחוזים.`;

/**
 * בונה בלוק ידע עסקי להזרקה ל-system prompt (גם דוח וגם דשבורד).
 * מקבל פרופיל עסקי מסווג ומחזיר טקסט שמתאר את סוג העסק, כוכב הצפון,
 * והמדדים שיש להוביל בהם — כדי שה-AI ידגיש את הדברים הנכונים.
 */
export function buildBusinessKnowledge(p: BusinessProfile): string {
  const star = northStarMetric(p);
  const metrics = taxonomyFor(p);
  const leadable = metrics.filter((m) => m.source === "column" || m.source === "derived");

  const funnelLabel =
    p.leadFunnel === "both"
      ? " (משולב: גם דפי נחיתה וגם טפסי לידים בפלטפורמה)"
      : p.leadFunnel === "native_form"
        ? " (טופס בפלטפורמה)"
        : " (דף נחיתה/אתר)";
  const typeLabel = p.type === "ecommerce" ? "איקומרס (חנות מקוונת)" : `לידים${funnelLabel}`;

  const crmLabel = p.crm === "connected" ? "יש גישה ל-CRM — אפשר לדווח עד סגירה/ROAS אמיתי" : "אין גישה ל-CRM — עצור בשורת הליד/רכישה של הפלטפורמה";

  const bothRule =
    p.type === "leads" && p.leadFunnel === "both"
      ? `\n**כלל למשפך משולב:** בסיכום הכולל אחד את כל הלידים למספר אחד. בפילוח לפי מוצר/שירות — הפרד בין "לידים מטופס" לבין "לידים מדף נחיתה/אתר" (הקמפיינים מסומנים בהתאם בנתונים).`
      : "";

  return [
    `**סוג העסק:** ${typeLabel}.`,
    `**גישת דאטה:** ${crmLabel}.`,
    `**כוכב הצפון (המדד המרכזי להוביל איתו):** ${star.label}.`,
    `**מדדים להדגיש (לפי סדר במשפך):** ${leadable.map((m) => m.label).join(" · ")}.${bothRule}`,
    ``,
    INSIGHT_RULES,
  ].join("\n");
}
