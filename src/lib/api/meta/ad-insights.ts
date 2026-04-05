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
  "spend", "impressions", "clicks", "reach", "frequency", "ctr", "cpc", "cpm",
  "actions", "action_values", "cost_per_action_type",
  "date_start", "date_stop",
  "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "account_id",
].join(",");

/**
 * שליפת insights של חשבון מודעות ברמה מבוקשת
 */
export async function fetchAdInsights(
  adAccountId: string,
  accessToken: string,
  level: InsightLevel,
  since: string,
  until: string,
  dailyBreakdown = true
): Promise<MetaInsight[]> {
  const params: Record<string, string> = {
    level,
    fields: INSIGHT_FIELDS,
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

export async function fetchCampaigns(adAccountId: string, accessToken: string): Promise<MetaCampaign[]> {
  return metaApiGetAll<MetaCampaign>(`/${adAccountId}/campaigns`, {
    accessToken,
    params: {
      fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy",
      limit: "200",
    },
  });
}
