// אגרגציה שבועית של נתוני קמפיינים ללקוח — מכל הפלטפורמות הפעילות.
// מחזיר סיכומים כוללים, פילוח לפי פלטפורמה, ופילוח לפי קמפיין (לדוחות פר-מוצר).

import { prisma } from "@/lib/db/prisma";
import { countConversions } from "@/lib/utils/metaMetrics";

export interface CampaignRow {
  platform: "meta" | "google" | "tiktok";
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
}

export interface PlatformTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
}

export interface WeeklyClientData {
  weekStart: string;
  weekEnd: string;
  selectedEvent: string;
  totals: PlatformTotals & { cpa: number; roas: number };
  perPlatform: { meta: PlatformTotals; google: PlatformTotals; tiktok: PlatformTotals };
  perCampaign: CampaignRow[];
}

const emptyTotals = (): PlatformTotals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 });

/**
 * שולף ומסכם את נתוני הקמפיינים של לקוח לשבוע נתון (YYYY-MM-DD).
 * Meta מסונן ל-level="campaign" (כך הוא נשמר ממילא) — מונע ספירה כפולה,
 * וה-name הוא שם הקמפיין.
 */
export async function getWeeklyClientData(
  clientId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyClientData> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { metaConversionEvent: true },
  });
  const selectedEvent = client?.metaConversionEvent ?? "";
  const date = { gte: weekStart, lte: weekEnd };

  const [metaRows, gadsRows, ttRows] = await Promise.all([
    prisma.metaInsightDaily.findMany({ where: { clientId, level: "campaign", date } }),
    prisma.googleAdsInsightDaily.findMany({ where: { clientId, date } }),
    prisma.tikTokInsightDaily.findMany({ where: { clientId, date } }),
  ]);

  const perCampaign: CampaignRow[] = [];
  const meta = emptyTotals();
  const google = emptyTotals();
  const tiktok = emptyTotals();

  // --- Meta — קיבוץ לפי שם קמפיין, המרות לפי האירוע הנבחר ---
  const metaGroups = new Map<string, typeof metaRows>();
  for (const r of metaRows) {
    const key = r.name || r.externalId || "(ללא שם)";
    const arr = metaGroups.get(key);
    if (arr) arr.push(r);
    else metaGroups.set(key, [r]);
  }
  for (const [campaignName, rows] of metaGroups) {
    const spend = rows.reduce((s, i) => s + i.spend, 0);
    const impressions = rows.reduce((s, i) => s + i.impressions, 0);
    const clicks = rows.reduce((s, i) => s + i.clicks, 0);
    const conversions = countConversions(rows, selectedEvent);
    const conversionsValue = rows.reduce((s, i) => s + i.purchaseValue, 0);
    perCampaign.push({ platform: "meta", campaignName, spend, impressions, clicks, conversions, conversionsValue });
    meta.spend += spend;
    meta.impressions += impressions;
    meta.clicks += clicks;
    meta.conversions += conversions;
    meta.conversionsValue += conversionsValue;
  }

  // --- Google Ads — קיבוץ לפי campaignName ---
  const gadsGroups = new Map<string, typeof gadsRows>();
  for (const r of gadsRows) {
    const key = r.campaignName || r.campaignId || "(ללא שם)";
    const arr = gadsGroups.get(key);
    if (arr) arr.push(r);
    else gadsGroups.set(key, [r]);
  }
  for (const [campaignName, rows] of gadsGroups) {
    const spend = rows.reduce((s, i) => s + i.spend, 0);
    const impressions = rows.reduce((s, i) => s + i.impressions, 0);
    const clicks = rows.reduce((s, i) => s + i.clicks, 0);
    const conversions = rows.reduce((s, i) => s + i.conversions, 0);
    const conversionsValue = rows.reduce((s, i) => s + i.conversionsValue, 0);
    perCampaign.push({ platform: "google", campaignName, spend, impressions, clicks, conversions, conversionsValue });
    google.spend += spend;
    google.impressions += impressions;
    google.clicks += clicks;
    google.conversions += conversions;
    google.conversionsValue += conversionsValue;
  }

  // --- TikTok — קיבוץ לפי campaignName ---
  const ttGroups = new Map<string, typeof ttRows>();
  for (const r of ttRows) {
    const key = r.campaignName || r.campaignId || "(ללא שם)";
    const arr = ttGroups.get(key);
    if (arr) arr.push(r);
    else ttGroups.set(key, [r]);
  }
  for (const [campaignName, rows] of ttGroups) {
    const spend = rows.reduce((s, i) => s + i.spend, 0);
    const impressions = rows.reduce((s, i) => s + i.impressions, 0);
    const clicks = rows.reduce((s, i) => s + i.clicks, 0);
    const conversions = rows.reduce((s, i) => s + i.conversions, 0);
    perCampaign.push({ platform: "tiktok", campaignName, spend, impressions, clicks, conversions, conversionsValue: 0 });
    tiktok.spend += spend;
    tiktok.impressions += impressions;
    tiktok.clicks += clicks;
    tiktok.conversions += conversions;
  }

  const totalSpend = meta.spend + google.spend + tiktok.spend;
  const totalConversions = meta.conversions + google.conversions + tiktok.conversions;
  const totalConvValue = meta.conversionsValue + google.conversionsValue + tiktok.conversionsValue;

  perCampaign.sort((a, b) => b.spend - a.spend);

  return {
    weekStart,
    weekEnd,
    selectedEvent,
    totals: {
      spend: totalSpend,
      impressions: meta.impressions + google.impressions + tiktok.impressions,
      clicks: meta.clicks + google.clicks + tiktok.clicks,
      conversions: totalConversions,
      conversionsValue: totalConvValue,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
    },
    perPlatform: { meta, google, tiktok },
    perCampaign,
  };
}
