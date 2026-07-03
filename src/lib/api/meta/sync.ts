// לוגיקת סנכרון משותפת בין manual sync ל-cron

import { prisma } from "@/lib/db/prisma";
import { fetchAdInsights, extractMetrics, type MetaInsight } from "./ad-insights";
import { fetchPagePosts, fetchPostInsights, fetchPostEngagement, extractMediaInfo } from "./page";
import { fetchIgMedia, fetchIgMediaInsights } from "./instagram";
import { shiftYmd } from "@/lib/utils/ildate";

export interface SyncStats {
  adInsightsFetched: number;
  pagePostsFetched: number;
  igMediaFetched: number;
  errors: string[];
}

/**
 * סנכרון חשבון מודעות — שואב insights ברמת קמפיין (daily) ושומר ב-DB
 */
/**
 * מפצל טווח תאריכים לחלונות של maxDays ימים
 */
function splitDateRange(since: string, until: string, maxDays = 7): Array<{ since: string; until: string }> {
  const chunks: Array<{ since: string; until: string }> = [];
  const start = new Date(since);
  const end = new Date(until);
  const cur = new Date(start);

  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    chunks.push({ since: fmt(cur), until: fmt(chunkEnd) });
    cur.setDate(cur.getDate() + maxDays);
  }

  return chunks;
}

export async function syncAdAccount(
  clientId: string, accessToken: string, assetId: string, externalId: string,
  since: string, until: string, stats: SyncStats
) {
  console.log(`[Sync] Ad Account ${externalId} | client: ${clientId} | range: ${since} → ${until}`);

  // פיצול ל-7 ימים כדי למנוע timeout
  const chunks = splitDateRange(since, until, 7);
  console.log(`[Sync] Splitting into ${chunks.length} chunks`);

  const allInsights: MetaInsight[] = [];
  for (const chunk of chunks) {
    try {
      const chunkInsights = await fetchAdInsights(externalId, accessToken, "campaign", chunk.since, chunk.until, true);
      allInsights.push(...chunkInsights);
      console.log(`[Sync] Chunk ${chunk.since}→${chunk.until}: ${chunkInsights.length} rows`);
    } catch (err) {
      console.error(`[Sync] Chunk ${chunk.since}→${chunk.until} failed: ${err instanceof Error ? err.message : err}`);
      stats.errors.push(`chunk ${chunk.since}-${chunk.until}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  const insights = allInsights;
  console.log(`[Sync] Ad Account ${externalId} → ${insights.length} total insight rows`);

  for (const ins of insights) {
    await prisma.metaInsightDaily.upsert({
      where: {
        assetId_level_externalId_date: {
          assetId, level: "campaign", externalId: ins.campaign_id ?? "", date: ins.date_start,
        },
      },
      update: insightData(ins, ins.campaign_name ?? ""),
      create: {
        clientId, assetId, level: "campaign",
        externalId: ins.campaign_id ?? "",
        parentId: "",
        date: ins.date_start,
        ...insightData(ins, ins.campaign_name ?? ""),
      },
    });
    stats.adInsightsFetched++;
  }

  // רמות adset (קהלים) ו-ad (קריאייטיבים) — חלון קבוע של 14 יום אחורה.
  // מספיק לדוח השבועי + השוואה לשבוע קודם, בלי להכביד על ה-API בטווחים ארוכים.
  // כשל כאן לא שובר את סנכרון הקמפיינים (ה-try פנימי).
  await syncSubLevels(clientId, accessToken, assetId, externalId, until, stats);

  await prisma.syncLog.create({
    data: {
      platform: "meta", clientId, assetId,
      syncType: "ad_insights", status: "success", recordsFetched: insights.length,
    },
  });
}

/** בונה את אובייקט המדדים לשמירה מתוך שורת insight (זהה לכל הרמות) */
function insightData(ins: MetaInsight, name: string) {
  const m = extractMetrics(ins);
  return {
    name,
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
}

/** סנכרון רמות adset + ad ל-14 הימים האחרונים — לפירוק קהלים/קריאייטיבים בדוחות */
async function syncSubLevels(
  clientId: string, accessToken: string, assetId: string, externalId: string,
  until: string, stats: SyncStats,
) {
  const since = shiftYmd(until, -13);

  for (const level of ["adset", "ad"] as const) {
    try {
      const chunks = splitDateRange(since, until, 7);
      const rows: MetaInsight[] = [];
      for (const chunk of chunks) {
        rows.push(...await fetchAdInsights(externalId, accessToken, level, chunk.since, chunk.until, true));
      }
      console.log(`[Sync] ${level} insights: ${rows.length} rows (${since} → ${until})`);

      // upserts במנות מקביליות — רמת ad יכולה להחזיר מאות שורות
      const BATCH = 25;
      for (let i = 0; i < rows.length; i += BATCH) {
        await Promise.all(rows.slice(i, i + BATCH).map((ins) => {
          const entityId = (level === "adset" ? ins.adset_id : ins.ad_id) ?? "";
          if (!entityId) return Promise.resolve();
          const parentId = (level === "adset" ? ins.campaign_id : ins.adset_id) ?? "";
          const name = (level === "adset" ? ins.adset_name : ins.ad_name) ?? "";
          return prisma.metaInsightDaily.upsert({
            where: { assetId_level_externalId_date: { assetId, level, externalId: entityId, date: ins.date_start } },
            update: insightData(ins, name),
            create: { clientId, assetId, level, externalId: entityId, parentId, date: ins.date_start, ...insightData(ins, name) },
          });
        }));
      }
      stats.adInsightsFetched += rows.length;
    } catch (err) {
      const msg = `${level} insights: ${err instanceof Error ? err.message : "unknown"}`;
      console.error(`[Sync] ${msg}`);
      stats.errors.push(msg);
    }
  }
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

  // תמיד סנכרן 3 ימים אחרונים (Meta מעדכן עד 72 שעות אחורה)
  const today = new Date();
  const forceRefreshDates = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    forceRefreshDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  // חשב ימים חסרים + 3 ימים אחרונים (תמיד)
  const allDates: string[] = [];
  const cur = new Date(since);
  const end = new Date(until);
  while (cur <= end) {
    const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (!existingDates.has(ds) || forceRefreshDates.has(ds)) {
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
  console.log(`\n=== [SyncMeta] START client=${clientId} daysBack=${daysBack} forceAll=${forceAll} ===`);
  const stats: SyncStats = { adInsightsFetched: 0, pagePostsFetched: 0, igMediaFetched: 0, errors: [] };

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true } } },
  });

  if (!connection) {
    console.log("[SyncMeta] No active Meta connection found");
    stats.errors.push("לא נמצא חיבור Meta פעיל");
    return stats;
  }
  const daysUntilExpiry = connection.tokenExpiry ? Math.round((connection.tokenExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : "unknown";
  console.log(`[SyncMeta] Connection: ${connection.id} | account: ${connection.accountName} | ${connection.assets.length} assets | token expires: ${connection.tokenExpiry?.toISOString() ?? "unknown"} (${daysUntilExpiry} days)`);
  connection.assets.forEach((a) => console.log(`  Asset: ${a.assetType} | ${a.externalId} | ${a.name}`));

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

  console.log(`[SyncMeta] Effective range: ${effectiveSince} → ${effectiveUntil} (forceAll=${forceAll})`);

  for (const asset of connection.assets) {
    console.log(`[SyncMeta] Processing asset: ${asset.assetType} ${asset.externalId} (${asset.name})`);
    try {
      if (asset.assetType === "ad_account") {
        await syncAdAccount(clientId, connection.accessToken, asset.id, asset.externalId, effectiveSince, effectiveUntil, stats);
        // מסמנים סנכרון מיד אחרי ה-ad insights (הדאטה הקריטי) — כדי שסנכרון עמוד/אינסטגרם
        // איטי שנקטע ב-60ש' לא ישאיר את החיבור מסומן "לא סונכרן"
        await prisma.platformConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } }).catch(() => {});
      } else if (asset.assetType === "facebook_page") {
        const extra = JSON.parse(asset.extraData ?? "{}");
        const pageToken = extra.pageAccessToken ?? connection.accessToken;
        await syncPage(clientId, pageToken, asset.id, asset.externalId, stats);
      } else if (asset.assetType === "instagram") {
        await syncInstagram(clientId, connection.accessToken, asset.id, asset.externalId, stats);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "unknown";
      const msg = `${asset.assetType} ${asset.externalId}: ${errMsg}`;
      console.error(`[SyncMeta] ERROR: ${msg}`);

      // Token expired — mark connection as expired, stop processing this client
      if (errMsg.startsWith("META_TOKEN_EXPIRED")) {
        console.error(`[SyncMeta] Token expired for client ${clientId} — setting expiry to past`);
        await prisma.platformConnection.update({
          where: { id: connection.id },
          data: { tokenExpiry: new Date(0) }, // סימון כפג — בלי לשנות את השם
        });
        stats.errors.push(`TOKEN_EXPIRED: ${errMsg}`);
        break; // לא ממשיכים לנכסים נוספים — token פג
      }

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

  console.log(`[SyncMeta] DONE client=${clientId} | insights=${stats.adInsightsFetched} posts=${stats.pagePostsFetched} ig=${stats.igMediaFetched} errors=${stats.errors.length}`);
  if (stats.errors.length > 0) stats.errors.forEach((e) => console.error(`  Error: ${e}`));

  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return stats;
}
