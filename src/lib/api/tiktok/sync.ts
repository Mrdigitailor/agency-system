import { prisma } from "@/lib/db/prisma";
import { fetchCampaignReport, fetchCampaigns } from "./client";

export async function syncTikTokAccount(
  clientId: string,
  assetId: string,
  advertiserId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<{ fetched: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Fetch campaign names
    const campaigns = await fetchCampaigns(advertiserId, accessToken).catch(() => []);
    const nameMap = new Map(campaigns.map((c) => [c.campaign_id, c]));

    // Fetch report
    const rows = await fetchCampaignReport(advertiserId, accessToken, since, until);
    console.log(`[TikTok Sync] Got ${rows.length} rows for advertiser ${advertiserId}`);

    for (const row of rows) {
      const campaignId = String(row.campaign_id ?? "");
      const date = String(row.stat_time_day ?? "").split(" ")[0]; // "2026-04-18 00:00:00" → "2026-04-18"
      if (!campaignId || !date) continue;

      const camp = nameMap.get(campaignId);

      await prisma.tikTokInsightDaily.upsert({
        where: { assetId_campaignId_date: { assetId, campaignId, date } },
        update: {
          campaignName: camp?.campaign_name ?? "",
          campaignStatus: camp?.status ?? "",
          objectiveType: camp?.objective_type ?? "",
          spend: Number(row.spend ?? 0),
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          ctr: Number(row.ctr ?? 0),
          cpc: Number(row.cpc ?? 0),
          cpm: Number(row.cpm ?? 0),
          reach: Number(row.reach ?? 0),
          frequency: Number(row.frequency ?? 0),
          conversions: Number(row.conversion ?? 0),
          costPerConversion: Number(row.cost_per_conversion ?? 0),
          conversionRate: Number(row.conversion_rate ?? 0),
          videoViews: Number(row.video_play_actions ?? 0),
          videoWatched2s: Number(row.video_watched_2s ?? 0),
          videoWatched6s: Number(row.video_watched_6s ?? 0),
          likes: Number(row.likes ?? 0),
          comments: Number(row.comments ?? 0),
          shares: Number(row.shares ?? 0),
          follows: Number(row.follows ?? 0),
          profileVisits: Number(row.profile_visits ?? 0),
        },
        create: {
          clientId, assetId, campaignId, date,
          campaignName: camp?.campaign_name ?? "",
          campaignStatus: camp?.status ?? "",
          objectiveType: camp?.objective_type ?? "",
          spend: Number(row.spend ?? 0),
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          ctr: Number(row.ctr ?? 0),
          cpc: Number(row.cpc ?? 0),
          cpm: Number(row.cpm ?? 0),
          reach: Number(row.reach ?? 0),
          frequency: Number(row.frequency ?? 0),
          conversions: Number(row.conversion ?? 0),
          costPerConversion: Number(row.cost_per_conversion ?? 0),
          conversionRate: Number(row.conversion_rate ?? 0),
          videoViews: Number(row.video_play_actions ?? 0),
          videoWatched2s: Number(row.video_watched_2s ?? 0),
          videoWatched6s: Number(row.video_watched_6s ?? 0),
          likes: Number(row.likes ?? 0),
          comments: Number(row.comments ?? 0),
          shares: Number(row.shares ?? 0),
          follows: Number(row.follows ?? 0),
          profileVisits: Number(row.profile_visits ?? 0),
        },
      });
    }

    return { fetched: rows.length, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[TikTok Sync] Error:`, msg);
    errors.push(msg);
    return { fetched: 0, errors };
  }
}

export async function syncClientTikTok(clientId: string, daysBack = 30): Promise<{ fetched: number; errors: string[] }> {
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "tiktok", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "tiktok_ad_account" } } },
  });

  if (!connection) return { fetched: 0, errors: ["אין חיבור TikTok פעיל"] };

  const now = new Date();
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  let totalFetched = 0;
  const allErrors: string[] = [];

  for (const asset of connection.assets) {
    const result = await syncTikTokAccount(clientId, asset.id, asset.externalId, connection.accessToken, fmt(sinceDate), fmt(now));
    totalFetched += result.fetched;
    allErrors.push(...result.errors);
  }

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { fetched: totalFetched, errors: allErrors };
}
