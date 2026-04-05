import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { fetchAdInsights, extractConversions } from "@/lib/api/meta/ad-insights";
import { fetchPagePosts, fetchPostInsights, fetchPostEngagement, extractMediaInfo } from "@/lib/api/meta/page";
import { fetchIgMedia, fetchIgMediaInsights } from "@/lib/api/meta/instagram";

/**
 * Cron יומי לסנכרון נתוני Meta מכל הלקוחות עם חיבור פעיל
 * מאובטח ב-CRON_SECRET
 *
 * GET /api/cron/sync-meta
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: Request) {
  // אימות — Vercel Cron שולח Authorization או אפשר גם ?secret=
  const authHeader = req.headers.get("authorization");
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");

  const expected = process.env.CRON_SECRET;
  const provided = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    connectionsProcessed: 0,
    adInsightsFetched: 0,
    pagePostsFetched: 0,
    igMediaFetched: 0,
    errors: [] as string[],
  };

  // שלוף את כל החיבורים הפעילים
  const connections = await prisma.platformConnection.findMany({
    where: { platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true } } },
  });

  const today = new Date().toISOString().split("T")[0];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  for (const conn of connections) {
    results.connectionsProcessed++;

    for (const asset of conn.assets) {
      try {
        if (asset.assetType === "ad_account") {
          await syncAdAccount(conn.clientId, conn.accessToken, asset.id, asset.externalId, since, today, results);
        } else if (asset.assetType === "facebook_page") {
          const extra = JSON.parse(asset.extraData ?? "{}");
          const pageToken = extra.pageAccessToken ?? conn.accessToken;
          await syncPage(conn.clientId, pageToken, asset.id, asset.externalId, results);
        } else if (asset.assetType === "instagram") {
          await syncInstagram(conn.clientId, conn.accessToken, asset.id, asset.externalId, results);
        }
      } catch (err) {
        const msg = `${asset.assetType} ${asset.externalId}: ${err instanceof Error ? err.message : "unknown"}`;
        results.errors.push(msg);
        await prisma.syncLog.create({
          data: {
            platform: "meta",
            clientId: conn.clientId,
            connectionId: conn.id,
            assetId: asset.id,
            syncType: asset.assetType === "ad_account" ? "ad_insights" : asset.assetType === "facebook_page" ? "page_posts" : "instagram_media",
            status: "error",
            errorMessage: msg,
          },
        });
      }
    }

    // עדכון lastSyncAt של החיבור
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date() },
    });
  }

  const durationMs = Date.now() - startTime;
  return NextResponse.json({ ...results, durationMs });
}

async function syncAdAccount(
  clientId: string, accessToken: string, assetId: string, externalId: string,
  since: string, until: string, results: { adInsightsFetched: number }
) {
  const insights = await fetchAdInsights(externalId, accessToken, "campaign", since, until, true);

  for (const ins of insights) {
    const conversions = extractConversions(ins);
    await prisma.metaInsightDaily.upsert({
      where: {
        assetId_level_externalId_date: {
          assetId, level: "campaign", externalId: ins.campaign_id ?? "", date: ins.date_start,
        },
      },
      update: {
        name: ins.campaign_name ?? "",
        spend: parseFloat(ins.spend) || 0,
        impressions: parseInt(ins.impressions) || 0,
        clicks: parseInt(ins.clicks) || 0,
        reach: parseInt(ins.reach) || 0,
        frequency: parseFloat(ins.frequency) || 0,
        ctr: parseFloat(ins.ctr) || 0,
        cpc: parseFloat(ins.cpc) || 0,
        cpm: parseFloat(ins.cpm) || 0,
        conversions: conversions.conversions,
        costPerConversion: conversions.costPerConversion,
        purchaseValue: conversions.purchaseValue,
        roas: conversions.roas,
        actionsJson: JSON.stringify({ actions: ins.actions, action_values: ins.action_values }),
      },
      create: {
        clientId, assetId, level: "campaign",
        externalId: ins.campaign_id ?? "",
        parentId: "",
        name: ins.campaign_name ?? "",
        date: ins.date_start,
        spend: parseFloat(ins.spend) || 0,
        impressions: parseInt(ins.impressions) || 0,
        clicks: parseInt(ins.clicks) || 0,
        reach: parseInt(ins.reach) || 0,
        frequency: parseFloat(ins.frequency) || 0,
        ctr: parseFloat(ins.ctr) || 0,
        cpc: parseFloat(ins.cpc) || 0,
        cpm: parseFloat(ins.cpm) || 0,
        conversions: conversions.conversions,
        costPerConversion: conversions.costPerConversion,
        purchaseValue: conversions.purchaseValue,
        roas: conversions.roas,
        actionsJson: JSON.stringify({ actions: ins.actions, action_values: ins.action_values }),
      },
    });
    results.adInsightsFetched++;
  }

  await prisma.syncLog.create({
    data: {
      platform: "meta", clientId, assetId,
      syncType: "ad_insights", status: "success", recordsFetched: insights.length,
    },
  });
}

async function syncPage(
  clientId: string, pageAccessToken: string, assetId: string, externalId: string,
  results: { pagePostsFetched: number }
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
    results.pagePostsFetched++;
  }

  await prisma.syncLog.create({
    data: {
      platform: "meta", clientId, assetId,
      syncType: "page_posts", status: "success", recordsFetched: posts.length,
    },
  });
}

async function syncInstagram(
  clientId: string, accessToken: string, assetId: string, externalId: string,
  results: { igMediaFetched: number }
) {
  const media = await fetchIgMedia(externalId, accessToken, 50);

  for (const m of media) {
    const insights = await fetchIgMediaInsights(m, accessToken);

    await prisma.metaInstagramMedia.upsert({
      where: { assetId_externalId: { assetId, externalId: m.id } },
      update: {
        caption: m.caption ?? "",
        permalink: m.permalink ?? "",
        mediaType: m.media_type ?? "",
        mediaUrl: m.media_url ?? "",
        thumbnailUrl: m.thumbnail_url ?? "",
        reach: insights.reach,
        impressions: insights.impressions,
        likes: insights.likes,
        comments: insights.comments,
        saves: insights.saves,
        shares: insights.shares,
        videoViews: insights.videoViews,
        profileVisits: insights.profileVisits,
        lastSyncAt: new Date(),
      },
      create: {
        clientId, assetId, externalId: m.id,
        caption: m.caption ?? "",
        permalink: m.permalink ?? "",
        mediaType: m.media_type ?? "",
        mediaUrl: m.media_url ?? "",
        thumbnailUrl: m.thumbnail_url ?? "",
        timestamp: new Date(m.timestamp),
        reach: insights.reach,
        impressions: insights.impressions,
        likes: insights.likes,
        comments: insights.comments,
        saves: insights.saves,
        shares: insights.shares,
        videoViews: insights.videoViews,
        profileVisits: insights.profileVisits,
      },
    });
    results.igMediaFetched++;
  }

  await prisma.syncLog.create({
    data: {
      platform: "meta", clientId, assetId,
      syncType: "instagram_media", status: "success", recordsFetched: media.length,
    },
  });
}
