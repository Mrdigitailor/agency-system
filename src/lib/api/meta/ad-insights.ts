// שליפת insights מחשבונות מודעות ב-Meta

import { metaApiGetAll } from "./client";

export type InsightLevel = "account" | "campaign" | "adset" | "ad";

export interface MetaInsight {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  reach: string;
  frequency: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  account_id?: string;
}

const INSIGHT_FIELDS = [
  // מזהים
  "campaign_name", "campaign_id", "adset_name", "adset_id", "ad_name", "ad_id",
  "account_id", "account_name", "account_currency",
  // מטרה + הגדרות
  "objective", "optimization_goal",
  "attribution_setting",
  // מדדים בסיסיים
  "spend", "social_spend", "impressions", "reach", "frequency",
  "clicks", "unique_clicks", "cpc", "cpm", "cpp", "ctr", "unique_ctr",
  // קליקים מפורטים
  "inline_link_clicks", "inline_link_click_ctr", "cost_per_inline_link_click",
  "unique_inline_link_clicks", "unique_inline_link_click_ctr", "cost_per_unique_inline_link_click",
  "outbound_clicks", "outbound_clicks_ctr", "cost_per_outbound_click",
  "unique_outbound_clicks", "unique_outbound_clicks_ctr", "cost_per_unique_outbound_click",
  "website_ctr",
  // המרות + actions
  "actions", "action_values", "cost_per_action_type",
  "cost_per_unique_action_type", "unique_actions",
  // מעורבות
  "inline_post_engagement", "cost_per_inline_post_engagement",
  // וידאו
  "video_play_actions", "video_30_sec_watched_actions",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p100_watched_actions",
  "video_avg_time_watched_actions",
  // זכירת מודעה
  "estimated_ad_recallers", "estimated_ad_recall_rate",
  // דירוגים
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  // תאריכים
  "date_start", "date_stop",
].join(",");

/**
 * שליפת insights של חשבון מודעות ברמה מבוקשת
 */
// רשימת שדות מצומצמת לרמות קהל/מודעה — רק מה שהפילוח צריך. מזרז משמעותית
// מול INSIGHT_FIELDS המלא (עשרות שדות וידאו/דירוגים שלא נחוצים לפירוק).
export const LEAN_INSIGHT_FIELDS = [
  "campaign_name", "campaign_id", "adset_name", "adset_id", "ad_name", "ad_id",
  "objective", "optimization_goal",
  "spend", "impressions", "clicks", "reach",
  "actions", "action_values",
  "date_start", "date_stop",
].join(",");

export async function fetchAdInsights(
  adAccountId: string,
  accessToken: string,
  level: InsightLevel,
  since: string,
  until: string,
  dailyBreakdown = true,
  fields: string = INSIGHT_FIELDS,
): Promise<MetaInsight[]> {
  const params: Record<string, string> = {
    level,
    fields,
    time_range: JSON.stringify({ since, until }),
    // Attribution window שתואם ל-Meta Ads Manager (ברירת מחדל)
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    use_unified_attribution_setting: "true",
    limit: "500",
  };
  if (dailyBreakdown) params.time_increment = "1";

  return metaApiGetAll<MetaInsight>(`/${adAccountId}/insights`, {
    accessToken,
    params,
    retries: 2,
  });
}

/**
 * חילוץ מטריקות מכל ה-actions של Meta
 */
export interface ExtractedMetrics {
  conversions: number;
  purchaseValue: number;
  roas: number;
  costPerConversion: number;
  linkClicks: number;
  landingPageViews: number;
  videoViews: number;
  videoThruplay: number;
  engagement: number;
  purchases: number;
  leads: number;
  costPerLead: number;
}

function getActionValue(actions: Array<{ action_type: string; value: string }> | undefined, types: string[]): number {
  if (!actions) return 0;
  let sum = 0;
  for (const a of actions) {
    if (types.includes(a.action_type)) {
      sum += parseFloat(a.value) || 0;
    }
  }
  return sum;
}

export function extractMetrics(insight: MetaInsight): ExtractedMetrics {
  const spend = parseFloat(insight.spend) || 0;

  // purchases — אם יש pixel purchase נעדיף אותו, אחרת offsite_conversion
  const purchases =
    getActionValue(insight.actions, ["offsite_conversion.fb_pixel_purchase"]) ||
    getActionValue(insight.actions, ["purchase"]);

  const purchaseValue =
    getActionValue(insight.action_values, ["offsite_conversion.fb_pixel_purchase"]) ||
    getActionValue(insight.action_values, ["purchase"]);

  const leads =
    getActionValue(insight.actions, ["lead"]) ||
    getActionValue(insight.actions, ["offsite_conversion.fb_pixel_lead"]);

  // conversions — כל הפעולות החשובות
  const conversions = purchases + leads ||
    getActionValue(insight.actions, ["offsite_conversion.fb_pixel_custom", "complete_registration", "initiate_checkout", "add_to_cart"]);

  const linkClicks = getActionValue(insight.actions, ["link_click"]);
  const landingPageViews = getActionValue(insight.actions, ["landing_page_view"]);
  const videoViews = getActionValue(insight.actions, ["video_view"]);
  const videoThruplay = getActionValue(insight.actions, ["video_thruplay_watched_actions"]);
  const engagement = getActionValue(insight.actions, ["post_engagement", "page_engagement"]);

  const costPerConversion = conversions > 0 ? spend / conversions : 0;
  const costPerLead = leads > 0 ? spend / leads : 0;
  const roas = spend > 0 ? purchaseValue / spend : 0;

  return {
    conversions, purchaseValue, roas, costPerConversion,
    linkClicks, landingPageViews, videoViews, videoThruplay, engagement,
    purchases, leads, costPerLead,
  };
}

/**
 * שליפת קמפיינים פעילים (metadata בלבד, בלי insights)
 */
export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
}

/**
 * מיפוי campaign_id → custom_conversion_id שהקמפיין מכוון אליו (מוגדר ברמת ה-adset).
 * זה מה ש-Ads Manager מציג בעמודת "תוצאות" — ולא ספירת הרכישות הגנרית של הפיקסל.
 */
export async function fetchCampaignTargetConversions(
  adAccountId: string,
  accessToken: string,
): Promise<Record<string, string>> {
  try {
    const adsets = await metaApiGetAll<{ campaign_id?: string; promoted_object?: { custom_conversion_id?: string } }>(
      `/${adAccountId}/adsets`,
      { accessToken, params: { fields: "campaign_id,promoted_object{custom_conversion_id}", limit: "300" } },
    );
    const map: Record<string, string> = {};
    for (const a of adsets) {
      const id = a.promoted_object?.custom_conversion_id;
      if (id && a.campaign_id) map[a.campaign_id] = id;
    }
    return map;
  } catch {
    return {}; // כשל כאן לעולם לא מפיל סנכרון — נופלים לספירה הגנרית
  }
}

export async function fetchCampaigns(adAccountId: string, accessToken: string): Promise<MetaCampaign[]> {
  return metaApiGetAll<MetaCampaign>(`/${adAccountId}/campaigns`, {
    accessToken,
    params: {
      fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy",
      limit: "200",
    },
  });
}
