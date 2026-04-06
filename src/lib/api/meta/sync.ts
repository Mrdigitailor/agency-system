// לוגיקת סנכרון משותפת בין manual sync ל-cron

import { prisma } from "@/lib/db/prisma";
import { fetchAdInsights, extractMetrics } from "./ad-insights";
import { fetchPagePosts, fetchPostInsights, fetchPostEngagement, extractMediaInfo } from "./page";
import { fetchIgMedia, fetchIgMediaInsights } from "./instagram";

export interface SyncStats {
  adInsightsFetched: number;
  pagePostsFetched: number;
  igMediaFetched: number;
  errors: string[];
}

/**
 * סנכרון חשבון מודעות — שואב insights ברמת קמפיין (daily) ושומר ב-DB
 */
export async function syncAdAccount(
  clientId: string, accessToken: string, assetId: string, externalId: string,
  since: string, until: string, stats: SyncStats
) {
  const insights = await fetchAdInsights(externalId, accessToken, "campaign", since, until, true);

  for (const ins of insights) {
    const m = extractMetrics(ins);
    const data = {
      name: ins.campaign_name ?? "",
      spend: parseFloat(ins.spend) || 0,
      impressions: parseInt(ins.impressions) || 0,
      clicks: parseInt(ins.clicks) || 0,
      reach: parseInt(ins.reach) || 0,
      frequency: parseFloat(ins.frequency) || 0,
      ctr: parseFloat(ins.ctr) || 0,
      cpc: parseFloat(ins.cpc) || 0,
      cpm: parseFloat(ins.cpm) || 0,
      conversions: m.conversions,
      costPerConversion: m.costPerConversion,
      purchaseValue: m.purchaseValue,
      roas: m.roas,
      linkClicks: m.linkClicks,
      landingPageViews: m.landingPageViews,
      videoViews: m.videoViews,
      videoThruplay: m.videoThruplay,
      engagement: m.engagement,
      purchases: m.purchases,
      leads: m.leads,
      costPerLead: m.costPerLead,
      actionsJson: JSON.stringify(ins),
    };

    await prisma.metaInsightDaily.upsert({
      where: {
        assetId_level_externalId_date: {
          assetId, level: "campaign", externalId: ins.campaign_id ?? "", date: ins.date_start,
        },
      },
      update: data,
      create: {
        clientId, assetId, level: "campaign",
        externalId: ins.campaign_id ?? "",
        parentId: "",
        date: ins.date_start,
        ...data,
      },
    });
    stats.adInsightsFetched++;
  }

  await prisma.syncLog.create({
    data: {
      platform: "meta", clientId, assetId,
      syncType: "ad_insights", status: "success", recordsFetched: insights.length,
    },
  });
}

export async function syncPage(
  clientId: string, pageAccessToken: string, assetId: string, externalId: string, stats: SyncStats
) {
  const posts = await fetchPagePosts(externalId, pageAccessToken, 50);

  for (const post of posts) {
    const [insights, engagement] = await Promise.all([
      fetchPostInsights(post.id, pageAccessToken),
      fetchPostEngagement(post.id, pageAccessToken),
    ]);
    const media = extractMediaInfo(post);

    await prisma.metaPagePost.upsert({
      where: { assetId_externalId: { assetId, externalId: post.id } },
      update: {
        message: post.message ?? "",
        permalink: post.permalink_url ?? "",
        mediaType: media.mediaType,
        mediaUrl: media.mediaUrl,
        reach: insights.reach,
        impressions: insights.impressions,
        engagement: insights.engagement,
        reactions: insights.reactions,
        comments: engagement.comments,
        shares: engagement.shares,
        clicks: insights.clicks,
        videoViews: insights.videoViews,
        lastSyncAt: new Date(),
      },
      create: {
        clientId, assetId, externalId: post.id,
        message: post.message ?? "",
        permalink: post.permalink_url ?? "",
        mediaType: media.mediaType,
        mediaUrl: media.mediaUrl,
        createdTime: new Date(post.created_time),
        reach: insights.reach,
        impressions: insights.impressions,
        engagement: insights.engagement,
        reactions: insights.reactions,
        comments: engagement.comments,
        shares: engagement.shares,
        clicks: insights.clicks,
        videoViews: insights.videoViews,
      },
    });
    stats.pagePostsFetched++;
  }

  await prisma.syncLog.create({
    data: {
      platform: "meta", clientId, assetId,
      syncType: "page_posts", status: "success", recordsFetched: posts.length,
    },
  });
}

export async function syncInstagram(
  clientId: string, accessToken: string, assetId: string, externalId: string, stats: SyncStats
) {
  const media = await fetchIgMedia(externalId, accessToken, 50);

  for (const m of media) {
    const insights = await fetchIgMediaInsights(m, accessToken);
    await prisma.metaInstagramMedia.upsert({
      where: { assetId_externalId: { assetId, externalId: m.id } },
      update: {
        caption: m.caption ?? "", permalink: m.permalink ?? "",
        mediaType: m.media_type ?? "", mediaUrl: m.media_url ?? "", thumbnailUrl: m.thumbnail_url ?? "",
        reach: insights.reach, impressions: insights.impressions,
        likes: insights.likes, comments: insights.comments, saves: insights.saves,
        shares: insights.shares, videoViews: insights.videoViews, profileVisits: insights.profileVisits,
        lastSyncAt: new Date(),
      },
      create: {
        clientId, assetId, externalId: m.id,
        caption: m.caption ?? "", permalink: m.permalink ?? "",
        mediaType: m.media_type ?? "", mediaUrl: m.media_url ?? "", thumbnailUrl: m.thumbnail_url ?? "",
        timestamp: new Date(m.timestamp),
        reach: insights.reach, impressions: insights.impressions,
        likes: insights.likes, comments: insights.comments, saves: insights.saves,
        shares: insights.shares, videoViews: insights.videoViews, profileVisits: insights.profileVisits,
      },
    });
    stats.igMediaFetched++;
  }

  await prisma.syncLog.create({
    data: {
      platform: "meta", clientId, assetId,
      syncType: "instagram_media", status: "success", recordsFetched: media.length,
    },
  });
}

/**
 * חישוב ימים חסרים — שואב רק ימים שלא קיימים ב-DB + last 2 days (Meta updates retroactively)
 */
async function getMissingDates(clientId: string, since: string, until: string): Promise<{ since: string; until: string } | null> {
  const existing = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
    select: { date: true },
    distinct: ["date"],
  });
  const existingDates = new Set(existing.map((r) => r.date));

  // תמיד סנכרן אתמול + היום (Meta מעדכן עד 48 שעות אחורה)
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  // חשב ימים חסרים
  const allDates: string[] = [];
  const cur = new Date(since);
  const end = new Date(until);
  while (cur <= end) {
    const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (!existingDates.has(ds) || ds === todayStr || ds === yesterdayStr) {
      allDates.push(ds);
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (allDates.length === 0) return null;

  // החזר את הטווח המינימלי שמכסה את כל הימים החסרים
  return { since: allDates[0], until: allDates[allDates.length - 1] };
}

/**
 * סנכרון של לקוח אחד — incremental: שואב רק ימים חסרים + last 2 days
 * forceAll=true: שואב את כל התקופה מחדש (כשלוחצים "סנכרן עכשיו")
 */
export async function syncClientMeta(clientId: string, daysBack = 30, forceAll = false): Promise<SyncStats> {
  const stats: SyncStats = { adInsightsFetched: 0, pagePostsFetched: 0, igMediaFetched: 0, errors: [] };

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true } } },
  });

  if (!connection) {
    stats.errors.push("לא נמצא חיבור Meta פעיל");
    return stats;
  }

  const todayDate = new Date();
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const today = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
  const since = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, "0")}-${String(sinceDate.getDate()).padStart(2, "0")}`;

  // Incremental: בדוק אם יש ימים חסרים
  let effectiveSince = since;
  let effectiveUntil = today;
  if (!forceAll) {
    const missing = await getMissingDates(clientId, since, today);
    if (!missing) {
      // הכל כבר קיים ב-DB — סנכרון לא נדרש
      return stats;
    }
    effectiveSince = missing.since;
    effectiveUntil = missing.until;
  }

  for (const asset of connection.assets) {
    try {
      if (asset.assetType === "ad_account") {
        await syncAdAccount(clientId, connection.accessToken, asset.id, asset.externalId, effectiveSince, effectiveUntil, stats);
      } else if (asset.assetType === "facebook_page") {
        const extra = JSON.parse(asset.extraData ?? "{}");
        const pageToken = extra.pageAccessToken ?? connection.accessToken;
        await syncPage(clientId, pageToken, asset.id, asset.externalId, stats);
      } else if (asset.assetType === "instagram") {
        await syncInstagram(clientId, connection.accessToken, asset.id, asset.externalId, stats);
      }
    } catch (err) {
      const msg = `${asset.assetType} ${asset.externalId}: ${err instanceof Error ? err.message : "unknown"}`;
      stats.errors.push(msg);
      await prisma.syncLog.create({
        data: {
          platform: "meta", clientId,
          connectionId: connection.id, assetId: asset.id,
          syncType: asset.assetType === "ad_account" ? "ad_insights" : asset.assetType === "facebook_page" ? "page_posts" : "instagram_media",
          status: "error", errorMessage: msg,
        },
      });
    }
  }

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return stats;
}
