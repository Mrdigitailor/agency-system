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
  "actions", "action_values", "date_start", "date_stop",
  "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "account_id",
].join(",");

/**
 * שליפת insights של חשבון מודעות ברמה מבוקשת
 * @param adAccountId - הפורמט: act_XXXXXX
 * @param level - רמת הפירוט
 * @param since/until - תאריכים YYYY-MM-DD
 * @param dailyBreakdown - חלוקה יומית (true) או סיכום (false)
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
 * חישוב conversions, purchase value ו-ROAS מהשדה actions
 */
export function extractConversions(insight: MetaInsight): {
  conversions: number;
  purchaseValue: number;
  roas: number;
  costPerConversion: number;
} {
  let conversions = 0;
  let purchaseValue = 0;

  // ספירת conversions מ-actions
  if (insight.actions) {
    for (const action of insight.actions) {
      if (action.action_type === "purchase" || action.action_type === "offsite_conversion.fb_pixel_purchase" || action.action_type === "lead") {
        conversions += parseFloat(action.value) || 0;
      }
    }
  }

  // ערך רכישה מ-action_values
  if (insight.action_values) {
    for (const action of insight.action_values) {
      if (action.action_type === "purchase" || action.action_type === "offsite_conversion.fb_pixel_purchase") {
        purchaseValue += parseFloat(action.value) || 0;
      }
    }
  }

  const spend = parseFloat(insight.spend) || 0;
  const roas = spend > 0 ? purchaseValue / spend : 0;
  const costPerConversion = conversions > 0 ? spend / conversions : 0;

  return { conversions, purchaseValue, roas, costPerConversion };
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
}

export async function fetchCampaigns(adAccountId: string, accessToken: string): Promise<MetaCampaign[]> {
  return metaApiGetAll<MetaCampaign>(`/${adAccountId}/campaigns`, {
    accessToken,
    params: {
      fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
      limit: "200",
    },
  });
}
