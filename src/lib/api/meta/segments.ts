// שליפת פילוחים דמוגרפיים מ-Meta (גיל/מגדר/מכשיר) — חי, לווידג'טי הדשבורד.
// מקביל ל-fetchGoogleSegment, אבל תומך גם בסינון פר-מוצר (campaignFilter) —
// כי אצל אלמה כל מוצר הוא קמפיין, וצריך "לידים לפי גיל/מכשיר" פר-מוצר.
import { prisma } from "@/lib/db/prisma";
import { metaApiGetAll } from "./client";

export type MetaSegment = "age" | "gender" | "device";
export interface MetaSegmentRow {
  label: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number; // ה-Result הגנרי (לידים אם יש, אחרת רכישות)
  leads: number;
  purchases: number;
}

// שם ה-breakdown ב-Meta + מאיפה לשלוף את ערך הבאקט מהשורה
const BREAKDOWN: Record<MetaSegment, { param: string; pick: (r: RawRow) => string }> = {
  age: { param: "age", pick: (r) => r.age ?? "?" },
  gender: { param: "gender", pick: (r) => r.gender ?? "?" },
  device: { param: "device_platform", pick: (r) => r.device_platform ?? "?" },
};

const LABELS: Record<string, string> = {
  male: "גברים", female: "נשים", unknown: "לא ידוע",
  mobile_app: "נייד (אפליקציה)", desktop: "מחשב", mobile_web: "נייד (דפדפן)",
  "13-17": "13-17", "18-24": "18-24", "25-34": "25-34", "35-44": "35-44",
  "45-54": "45-54", "55-64": "55-64", "65+": "65+",
};

const LEAD_ACTIONS = ["lead"]; // הסכום האגרגטיבי של מטא ללידים
const PURCHASE_ACTIONS = ["offsite_conversion.fb_pixel_purchase", "purchase"];

interface RawRow {
  age?: string;
  gender?: string;
  device_platform?: string;
  spend?: string;
  clicks?: string;
  impressions?: string;
  campaign_name?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

function actionSum(actions: RawRow["actions"], types: string[]): number {
  if (!actions) return 0;
  let s = 0;
  for (const a of actions) if (types.includes(a.action_type)) s += parseFloat(a.value) || 0;
  return s;
}

const norm = (s: string) => s.toLowerCase().replace(/[|]/g, " ").replace(/\s+/g, " ").trim();

/**
 * פילוח דמוגרפי חי מ-Meta לפי גיל/מגדר/מכשיר.
 * campaignFilter — אם ניתן, מסנן רק לקמפיינים ששמם מכיל את הביטוי (פר-מוצר).
 */
export async function fetchMetaSegment(
  clientId: string,
  since: string,
  until: string,
  segment: MetaSegment,
  campaignFilter?: string,
): Promise<MetaSegmentRow[]> {
  const conn = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "ad_account" } } },
  });
  const asset = conn?.assets[0];
  if (!conn || !asset) return [];

  const def = BREAKDOWN[segment];
  // ברמת קמפיין — כדי לאפשר סינון פר-מוצר. ללא time_increment (סכום לתקופה).
  const params: Record<string, string> = {
    level: "campaign",
    fields: "campaign_name,spend,clicks,impressions,actions",
    breakdowns: def.param,
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    use_unified_attribution_setting: "true",
    limit: "500",
  };

  let rows: RawRow[];
  try {
    rows = await metaApiGetAll<RawRow>(`/${asset.externalId}/insights`, {
      accessToken: conn.accessToken,
      params,
      retries: 2,
    });
  } catch {
    return [];
  }

  const f = campaignFilter ? norm(campaignFilter) : "";
  const agg = new Map<string, MetaSegmentRow>();
  for (const r of rows) {
    if (f && !norm(r.campaign_name ?? "").includes(f)) continue;
    const key = def.pick(r);
    const leads = actionSum(r.actions, LEAD_ACTIONS);
    const purchases = actionSum(r.actions, PURCHASE_ACTIONS);
    const e = agg.get(key) ?? { label: LABELS[key] ?? key, spend: 0, clicks: 0, impressions: 0, conversions: 0, leads: 0, purchases: 0 };
    e.spend += parseFloat(r.spend ?? "0") || 0;
    e.clicks += parseInt(r.clicks ?? "0") || 0;
    e.impressions += parseInt(r.impressions ?? "0") || 0;
    e.leads += leads;
    e.purchases += purchases;
    e.conversions += leads > 0 ? leads : purchases;
    agg.set(key, e);
  }
  return [...agg.values()].sort((a, b) => b.conversions - a.conversions || b.spend - a.spend);
}
