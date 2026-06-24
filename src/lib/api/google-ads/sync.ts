// סנכרון נתוני Google Ads — שואב campaigns ושומר ב-DB

import { prisma } from "@/lib/db/prisma";
import { searchStream, getValidGoogleToken } from "./client";

const MICROS = 1_000_000;

/**
 * שליפת נתוני קמפיינים מ-Google Ads + שמירה ב-DB
 */
export async function syncGoogleAdsAccount(
  clientId: string,
  assetId: string,
  customerId: string,
  token: string,
  since: string,
  until: string,
  mccId?: string,
): Promise<{ fetched: number; errors: string[] }> {
  const errors: string[] = [];

  const query = `
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions,
      metrics.conversions_value,
      metrics.cost_per_conversion,
      metrics.ctr, metrics.average_cpc,
      metrics.average_cpm,
      metrics.interactions,
      metrics.all_conversions,
      metrics.all_conversions_value,
      metrics.video_views, metrics.video_quartile_p100_rate,
      metrics.search_impression_share,
      metrics.content_impression_share,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY segments.date DESC
  `;

  // שאילתה שנייה — פירוט המרות לפי conversion action (לבחירת המרות לספירה)
  const actionQuery = `
    SELECT campaign.id, segments.date, segments.conversion_action_name, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}' AND metrics.conversions > 0
  `;
  const actionMap = new Map<string, Record<string, number>>();

  try {
    const results = await searchStream(customerId, query, {
      accessToken: token,
      loginCustomerId: mccId || undefined,
    });
    console.log(`[GoogleAds Sync] Got ${results.length} rows for customer ${customerId}`);

    // פירוט לפי conversion action — לא חוסם את הסנכרון אם נכשל
    try {
      const actionRows = await searchStream(customerId, actionQuery, {
        accessToken: token,
        loginCustomerId: mccId || undefined,
      });
      for (const row of actionRows) {
        const cid = String(row.campaign?.id ?? "");
        const d = row.segments?.date ?? "";
        const actionName = row.segments?.conversionActionName ?? "";
        const conv = Number(row.metrics?.conversions ?? 0);
        if (!cid || !d || !actionName) continue;
        const key = `${cid}|${d}`;
        const entry = actionMap.get(key) ?? {};
        entry[actionName] = (entry[actionName] ?? 0) + conv;
        actionMap.set(key, entry);
      }
      console.log(`[GoogleAds Sync] Conversion-action breakdown: ${actionMap.size} campaign-day rows`);
    } catch (err) {
      console.warn(`[GoogleAds Sync] conversion_action query failed: ${(err as Error).message?.slice(0, 80)}`);
    }

    for (const row of results) {
      const c = row.campaign ?? {};
      const m = row.metrics ?? {};
      const s = row.segments ?? {};
      const b = row.campaignBudget ?? {};

      const campaignId = String(c.id ?? "");
      const date = s.date ?? "";
      if (!campaignId || !date) continue;
      const conversionsByAction = JSON.stringify(actionMap.get(`${campaignId}|${date}`) ?? {});

      await prisma.googleAdsInsightDaily.upsert({
        where: {
          assetId_campaignId_date: { assetId, campaignId, date },
        },
        update: {
          campaignName: c.name ?? "",
          campaignStatus: c.status ?? "",
          channelType: c.advertisingChannelType ?? "",
          budgetMicros: BigInt(b.amountMicros ?? 0),
          spend: Number(m.costMicros ?? 0) / MICROS,
          impressions: Number(m.impressions ?? 0),
          clicks: Number(m.clicks ?? 0),
          conversions: Number(m.conversions ?? 0),
          conversionsValue: Number(m.conversionsValue ?? 0),
          conversionsByAction,
          costPerConversion: Number(m.costPerConversion ?? 0) / MICROS,
          ctr: Number(m.ctr ?? 0),
          averageCpc: Number(m.averageCpc ?? 0) / MICROS,
          averageCpm: Number(m.averageCpm ?? 0) / MICROS,
          interactions: Number(m.interactions ?? 0),
          allConversions: Number(m.allConversions ?? 0),
          allConversionsValue: Number(m.allConversionsValue ?? 0),
          videoViews: Number(m.videoViews ?? 0),
          videoQuartile100: Number(m.videoQuartileP100Rate ?? 0),
          searchImprShare: Number(m.searchImpressionShare ?? 0),
          contentImprShare: Number(m.contentImpressionShare ?? 0),
        },
        create: {
          clientId,
          assetId,
          campaignId,
          date,
          campaignName: c.name ?? "",
          campaignStatus: c.status ?? "",
          channelType: c.advertisingChannelType ?? "",
          budgetMicros: BigInt(b.amountMicros ?? 0),
          spend: Number(m.costMicros ?? 0) / MICROS,
          impressions: Number(m.impressions ?? 0),
          clicks: Number(m.clicks ?? 0),
          conversions: Number(m.conversions ?? 0),
          conversionsValue: Number(m.conversionsValue ?? 0),
          conversionsByAction,
          costPerConversion: Number(m.costPerConversion ?? 0) / MICROS,
          ctr: Number(m.ctr ?? 0),
          averageCpc: Number(m.averageCpc ?? 0) / MICROS,
          averageCpm: Number(m.averageCpm ?? 0) / MICROS,
          interactions: Number(m.interactions ?? 0),
          allConversions: Number(m.allConversions ?? 0),
          allConversionsValue: Number(m.allConversionsValue ?? 0),
          videoViews: Number(m.videoViews ?? 0),
          videoQuartile100: Number(m.videoQuartileP100Rate ?? 0),
          searchImprShare: Number(m.searchImpressionShare ?? 0),
          contentImprShare: Number(m.contentImpressionShare ?? 0),
        },
      });
    }

    return { fetched: results.length, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[GoogleAds Sync] Error:`, msg);
    errors.push(msg);
    return { fetched: 0, errors };
  }
}

/**
 * סנכרון כל חשבונות Google Ads של לקוח
 */
export async function syncClientGoogleAds(clientId: string, daysBack = 30): Promise<{
  fetched: number;
  errors: string[];
}> {
  console.log(`[GoogleAds] syncClientGoogleAds client=${clientId} daysBack=${daysBack}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "google_ads", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "google_ads_account" } } },
  });

  if (!connection) return { fetched: 0, errors: ["אין חיבור Google Ads פעיל"] };

  const now = new Date();
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const since = fmt(sinceDate);
  const until = fmt(now);

  let totalFetched = 0;
  const allErrors: string[] = [];

  // וודא שיש token תקף לפני התחלת הסנכרון — מרענן ב-DB אם צריך
  let token: string;
  try {
    token = await getValidGoogleToken(connection);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { fetched: 0, errors: [msg] };
  }

  for (const asset of connection.assets) {
    const extra = JSON.parse(asset.extraData || "{}");
    const mccId = extra.mccId ?? "";
    const result = await syncGoogleAdsAccount(
      clientId,
      asset.id,
      asset.externalId,
      token,
      since,
      until,
      mccId,
    );
    totalFetched += result.fetched;
    allErrors.push(...result.errors);
  }

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { fetched: totalFetched, errors: allErrors };
}
