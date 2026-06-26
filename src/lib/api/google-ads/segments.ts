// שליפת פילוחים דמוגרפיים מ-Google Ads (גיל/מגדר/מכשיר) — חי, לווידג'טי הדשבורד.
import { prisma } from "@/lib/db/prisma";
import { searchStream, getValidGoogleToken } from "./client";

export type GoogleSegment = "age" | "gender" | "device";
export interface SegmentRow { label: string; conversions: number; spend: number; clicks: number }

interface RawRow {
  segments?: { device?: string };
  adGroupCriterion?: { ageRange?: { type?: string }; gender?: { type?: string } };
  metrics?: { conversions?: number; costMicros?: number; clicks?: number };
}

const QUERY: Record<GoogleSegment, { from: string; field: string; pick: (r: RawRow) => string }> = {
  device: { from: "campaign", field: "segments.device", pick: (r) => r.segments?.device ?? "?" },
  age: { from: "age_range_view", field: "ad_group_criterion.age_range.type", pick: (r) => r.adGroupCriterion?.ageRange?.type ?? "?" },
  gender: { from: "gender_view", field: "ad_group_criterion.gender.type", pick: (r) => r.adGroupCriterion?.gender?.type ?? "?" },
};

const LABELS: Record<string, string> = {
  MOBILE: "נייד", DESKTOP: "מחשב", TABLET: "טאבלט", CONNECTED_TV: "טלוויזיה", OTHER: "אחר",
  MALE: "גברים", FEMALE: "נשים", UNDETERMINED: "לא ידוע",
  AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44",
  AGE_RANGE_45_54: "45-54", AGE_RANGE_55_64: "55-64", AGE_RANGE_65_UP: "65+", AGE_RANGE_UNDETERMINED: "לא ידוע",
};

export async function fetchGoogleSegment(clientId: string, since: string, until: string, segment: GoogleSegment): Promise<SegmentRow[]> {
  const conn = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "google_ads", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "google_ads_account" } } },
  });
  const asset = conn?.assets[0];
  if (!conn || !asset) return [];

  let token: string;
  try { token = await getValidGoogleToken(conn); } catch { return []; }

  const extra = JSON.parse(asset.extraData || "{}");
  const mcc = extra.mccId ?? "";
  const def = QUERY[segment];
  const query = `SELECT ${def.field}, metrics.conversions, metrics.cost_micros, metrics.clicks FROM ${def.from} WHERE segments.date BETWEEN '${since}' AND '${until}'`;

  try {
    const rows = (await searchStream(asset.externalId, query, { accessToken: token, loginCustomerId: mcc || undefined })) as RawRow[];
    const agg = new Map<string, { conversions: number; spend: number; clicks: number }>();
    for (const r of rows) {
      const key = def.pick(r);
      const e = agg.get(key) ?? { conversions: 0, spend: 0, clicks: 0 };
      e.conversions += Number(r.metrics?.conversions ?? 0);
      e.spend += Number(r.metrics?.costMicros ?? 0) / 1_000_000;
      e.clicks += Number(r.metrics?.clicks ?? 0);
      agg.set(key, e);
    }
    return [...agg.entries()]
      .map(([k, v]) => ({ label: LABELS[k] ?? k, ...v }))
      .sort((a, b) => b.conversions - a.conversions);
  } catch {
    return [];
  }
}
