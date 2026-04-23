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
    console.log(`[TikTok Sync] ${advertiserId}: ${campaigns.length} campaigns, range ${since} → ${until}`);

    // Fetch report
    const rows = await fetchCampaignReport(advertiserId, accessToken, since, until);
    console.log(`[TikTok Sync] Got ${rows.length} rows from API`);

    let saved = 0;
    let totalSpend = 0;

    for (const row of rows) {
      const campaignId = String(row.campaign_id ?? "");
      const rawDate = String(row.stat_time_day ?? "");
      const date = rawDate.split(" ")[0]; // "2026-04-18 00:00:00" → "2026-04-18"
      const spend = parseFloat(String(row.spend ?? "0")) || 0;

      if (!campaignId || !date) {
        console.warn(`[TikTok Sync] Skipping row — missing campaignId or date: ${JSON.stringify(row).slice(0, 100)}`);
        continue;
      }

      totalSpend += spend;
      const camp = nameMap.get(campaignId);

      try {
        await prisma.tikTokInsightDaily.upsert({
          where: { assetId_campaignId_date: { assetId, campaignId, date } },
          update: {
            campaignName: camp?.campaign_name ?? "",
            campaignStatus: camp?.status ?? "",
            objectiveType: camp?.objective_type ?? "",
            spend,
            impressions: parseInt(String(row.impressions ?? "0")) || 0,
            clicks: parseInt(String(row.clicks ?? "0")) || 0,
            ctr: parseFloat(String(row.ctr ?? "0")) || 0,
            cpc: parseFloat(String(row.cpc ?? "0")) || 0,
            cpm: parseFloat(String(row.cpm ?? "0")) || 0,
            reach: parseInt(String(row.reach ?? "0")) || 0,
            frequency: parseFloat(String(row.frequency ?? "0")) || 0,
            conversions: parseInt(String(row.conversion ?? "0")) || 0,
            costPerConversion: parseFloat(String(row.cost_per_conversion ?? "0")) || 0,
            conversionRate: parseFloat(String(row.conversion_rate ?? "0")) || 0,
            videoViews: parseInt(String(row.video_play_actions ?? "0")) || 0,
            videoWatched2s: parseInt(String(row.video_watched_2s ?? "0")) || 0,
            videoWatched6s: parseInt(String(row.video_watched_6s ?? "0")) || 0,
            likes: parseInt(String(row.likes ?? "0")) || 0,
            comments: parseInt(String(row.comments ?? "0")) || 0,
            shares: parseInt(String(row.shares ?? "0")) || 0,
            follows: parseInt(String(row.follows ?? "0")) || 0,
            profileVisits: parseInt(String(row.profile_visits ?? "0")) || 0,
          },
          create: {
            clientId, assetId, campaignId, date,
            campaignName: camp?.campaign_name ?? "",
            campaignStatus: camp?.status ?? "",
            objectiveType: camp?.objective_type ?? "",
            spend,
            impressions: parseInt(String(row.impressions ?? "0")) || 0,
            clicks: parseInt(String(row.clicks ?? "0")) || 0,
            ctr: parseFloat(String(row.ctr ?? "0")) || 0,
            cpc: parseFloat(String(row.cpc ?? "0")) || 0,
            cpm: parseFloat(String(row.cpm ?? "0")) || 0,
            reach: parseInt(String(row.reach ?? "0")) || 0,
            frequency: parseFloat(String(row.frequency ?? "0")) || 0,
            conversions: parseInt(String(row.conversion ?? "0")) || 0,
            costPerConversion: parseFloat(String(row.cost_per_conversion ?? "0")) || 0,
            conversionRate: parseFloat(String(row.conversion_rate ?? "0")) || 0,
            videoViews: parseInt(String(row.video_play_actions ?? "0")) || 0,
            videoWatched2s: parseInt(String(row.video_watched_2s ?? "0")) || 0,
            videoWatched6s: parseInt(String(row.video_watched_6s ?? "0")) || 0,
            likes: parseInt(String(row.likes ?? "0")) || 0,
            comments: parseInt(String(row.comments ?? "0")) || 0,
            shares: parseInt(String(row.shares ?? "0")) || 0,
            follows: parseInt(String(row.follows ?? "0")) || 0,
            profileVisits: parseInt(String(row.profile_visits ?? "0")) || 0,
          },
        });
        saved++;
      } catch (err) {
        console.error(`[TikTok Sync] Upsert failed for ${campaignId}/${date}:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(`[TikTok Sync] Saved ${saved}/${rows.length} rows, total spend: ₪${totalSpend.toFixed(2)}`);
    return { fetched: saved, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[TikTok Sync] Error:`, msg);
    errors.push(msg);
    return { fetched: 0, errors };
  }
}

export async function syncClientTikTok(clientId: string, daysBack = 30): Promise<{ fetched: number; errors: string[] }> {
  console.log(`[TikTok] syncClientTikTok client=${clientId} daysBack=${daysBack}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "tiktok", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "tiktok_ad_account" } } },
  });

  if (!connection) return { fetched: 0, errors: ["אין חיבור TikTok פעיל"] };

  // Always sync from start of month for TikTok (not just last N days)
  // This ensures we get complete data
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const since = fmt(monthStart);
  const until = fmt(now);

  console.log(`[TikTok] Syncing ${since} → ${until} (${connection.assets.length} assets)`);

  let totalFetched = 0;
  const allErrors: string[] = [];

  for (const asset of connection.assets) {
    const result = await syncTikTokAccount(clientId, asset.id, asset.externalId, connection.accessToken, since, until);
    totalFetched += result.fetched;
    allErrors.push(...result.errors);
  }

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { fetched: totalFetched, errors: allErrors };
}
