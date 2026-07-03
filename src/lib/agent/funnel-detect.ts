// מנתח משפך אוטומטי — סורק את נתוני הקמפיינים של הלקוח ומסווג לבד
// אם הוא עובד עם דף נחיתה, טופס לידים בפלטפורמה, או שניהם ("גם וגם").
//
// הכללים (מסער):
//  - יש קמפיינים בגוגל → בוודאות יש אתר/דף נחיתה (אי אפשר גוגל בלי).
//  - קמפיין מטא מסווג לפי **מקור הלידים בפועל** (סוגי ה-actions), לא לפי
//    צפיות בדף — כי גם מי שראה קמפיין טופס יכול להיכנס אח"כ לאתר ולייצר
//    landing_page_views, וזה לא אומר שזו מטרת הקמפיין:
//      onsite_conversion.lead_grouped            → ליד מטופס בפלטפורמה
//      offsite_conversion.fb_pixel_lead / onsite_web_lead → ליד מהאתר (פיקסל)
//  - לקמפיינים בלי לידים עדיין: לפי מטרת הקמפיין (objective/optimization_goal).
//  - fallback אחרון: היסטיקת לידים/צפיות.

import { prisma } from "@/lib/db/prisma";
import { shiftYmd, todayIL } from "@/lib/utils/ildate";

/** סיווג משפך של קמפיין בודד (מטא) */
export type CampaignFunnel = "landing_page" | "native_form" | "unknown";
/** סיווג משפך ברמת הלקוח — כולל מצב משולב */
export type DetectedFunnel = "landing_page" | "native_form" | "both" | "unknown";

export interface FunnelDetection {
  funnel: DetectedFunnel;
  /** סיווג פר-קמפיין מטא, לפי שם קמפיין — לשימוש בפילוח לפי מוצר */
  metaCampaigns: Record<string, CampaignFunnel>;
  /** קמפיינים פעילים בגוגל בחלון הזמן → מרמז בוודאות על דף נחיתה/אתר */
  hasGoogleCampaigns: boolean;
}

// action types של לידים מטופס בפלטפורמה (הליד נוצר בתוך מטא)
const FORM_LEAD_ACTIONS = new Set(["onsite_conversion.lead_grouped", "leadgen_grouped", "leadgen.other"]);
// action types של לידים מהאתר (דרך פיקסל / אירוע ווב)
const SITE_LEAD_ACTIONS = new Set(["offsite_conversion.fb_pixel_lead", "onsite_web_lead"]);

// סיווג לפי מטרת קמפיין — לקמפיינים שעוד אין להם לידים
const FORM_GOALS = new Set(["LEAD_GENERATION", "QUALITY_LEAD", "CONVERSATIONS", "REPLIES"]);
const LANDING_GOALS = new Set(["OFFSITE_CONVERSIONS", "LANDING_PAGE_VIEWS", "LINK_CLICKS", "VALUE", "QUALITY_CALL"]);
const FORM_OBJECTIVES = new Set(["LEAD_GENERATION", "MESSAGES", "OUTCOME_ENGAGEMENT"]);
const LANDING_OBJECTIVES = new Set(["CONVERSIONS", "OUTCOME_SALES", "OUTCOME_TRAFFIC", "LINK_CLICKS", "TRAFFIC", "WEBSITE_CONVERSIONS"]);

interface CampaignAgg {
  formLeads: number;
  siteLeads: number;
  goal: string;
  objective: string;
  leads: number;
  lpv: number;
}

/** מסווג קמפיין בודד: קודם לפי מקור הלידים בפועל, אחר-כך לפי מטרה, ולבסוף היסטיקה */
function classifyCampaign(a: CampaignAgg): CampaignFunnel {
  // 1) מקור הלידים בפועל — הסיגנל המדויק ביותר
  if (a.formLeads > 0 || a.siteLeads > 0) {
    if (a.formLeads > 0 && a.siteLeads === 0) return "native_form";
    if (a.siteLeads > 0 && a.formLeads === 0) return "landing_page";
    return a.formLeads >= a.siteLeads ? "native_form" : "landing_page"; // שניהם — לפי הרוב
  }
  // 2) מטרת הקמפיין
  if (FORM_GOALS.has(a.goal)) return "native_form";
  if (LANDING_GOALS.has(a.goal)) return "landing_page";
  if (FORM_OBJECTIVES.has(a.objective)) return "native_form";
  if (LANDING_OBJECTIVES.has(a.objective)) return "landing_page";
  // 3) fallback אחרון
  if (a.leads > 0 && a.lpv === 0) return "native_form";
  if (a.lpv > 0) return "landing_page";
  return "unknown";
}

/**
 * מזהה את סוג המשפך של הלקוח מתוך נתוני הקמפיינים.
 * ברירת מחדל: חלון של 30 יום אחורה מ-until (או מהיום), כדי שהסיווג יהיה יציב
 * ולא יתהפך בשבוע שבו קמפיין מסוים היה כבוי.
 */
export async function detectClientFunnel(
  clientId: string,
  opts?: { until?: string; windowDays?: number },
): Promise<FunnelDetection> {
  const until = opts?.until ?? todayIL();
  const since = shiftYmd(until, -(opts?.windowDays ?? 30));
  const date = { gte: since, lte: until };

  const [metaRows, googleActive] = await Promise.all([
    prisma.metaInsightDaily.findMany({
      where: { clientId, level: "campaign", date },
      select: { name: true, externalId: true, leads: true, landingPageViews: true, actionsJson: true },
      orderBy: { date: "desc" }, // השורה העדכנית ביותר של כל קמפיין ראשונה — המטרה הכי עדכנית
    }),
    prisma.googleAdsInsightDaily.count({ where: { clientId, date, spend: { gt: 0 } } }),
  ]);

  const agg = new Map<string, CampaignAgg>();
  for (const r of metaRows) {
    const key = r.name || r.externalId || "(ללא שם)";
    let cur = agg.get(key);
    if (!cur) {
      cur = { formLeads: 0, siteLeads: 0, goal: "", objective: "", leads: 0, lpv: 0 };
      agg.set(key, cur);
    }
    cur.leads += r.leads;
    cur.lpv += r.landingPageViews;
    try {
      // actionsJson = שורת ה-insight המלאה ממטא, כולל actions + objective/optimization_goal
      const raw = JSON.parse(r.actionsJson) as {
        actions?: Array<{ action_type: string; value: string }>;
        optimization_goal?: string;
        objective?: string;
      };
      for (const act of raw.actions ?? []) {
        const v = parseFloat(act.value) || 0;
        if (FORM_LEAD_ACTIONS.has(act.action_type)) cur.formLeads += v;
        else if (SITE_LEAD_ACTIONS.has(act.action_type)) cur.siteLeads += v;
      }
      if (!cur.goal && !cur.objective) {
        cur.goal = (raw.optimization_goal ?? "").toUpperCase();
        cur.objective = (raw.objective ?? "").toUpperCase();
      }
    } catch { /* שורה ישנה בלי JSON תקין — נסתמך על שאר השורות */ }
  }

  const metaCampaigns: Record<string, CampaignFunnel> = {};
  let hasLandingPage = googleActive > 0;
  let hasNativeForm = false;

  for (const [name, a] of agg) {
    const f = classifyCampaign(a);
    metaCampaigns[name] = f;
    if (f === "landing_page") hasLandingPage = true;
    if (f === "native_form") hasNativeForm = true;
  }

  const funnel: DetectedFunnel =
    hasLandingPage && hasNativeForm ? "both"
    : hasLandingPage ? "landing_page"
    : hasNativeForm ? "native_form"
    : "unknown";

  return { funnel, metaCampaigns, hasGoogleCampaigns: googleActive > 0 };
}
