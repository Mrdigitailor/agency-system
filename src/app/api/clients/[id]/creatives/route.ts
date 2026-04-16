import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { metaApiGetAll, metaApiGet } from "@/lib/api/meta/client";

const STALE_MS = 10 * 60 * 1000; // 10 min

/**
 * GET /api/clients/[id]/creatives — read from cache, sync if stale
 * POST /api/clients/[id]/creatives — force sync
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId } = await params;

  // Check cache freshness
  const latest = await prisma.metaCreative.findFirst({
    where: { clientId },
    orderBy: { lastSyncAt: "desc" },
    select: { lastSyncAt: true },
  });

  const isStale = !latest || Date.now() - latest.lastSyncAt.getTime() > STALE_MS;

  // If empty, do blocking sync
  const count = await prisma.metaCreative.count({ where: { clientId } });
  if (count === 0) {
    const result = await syncCreatives(clientId);
    if (result.error) return NextResponse.json({ creatives: [], error: result.error });
  } else if (isStale) {
    // Background sync
    syncCreatives(clientId).catch(() => {});
  }

  const creatives = await prisma.metaCreative.findMany({
    where: { clientId },
    orderBy: { lastSyncAt: "desc" },
  });

  return NextResponse.json({
    creatives: creatives.map((c) => ({
      ...c,
      insights: JSON.parse(c.insightsJson || "{}"),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId } = await params;
  const result = await syncCreatives(clientId);

  const creatives = await prisma.metaCreative.findMany({
    where: { clientId },
    orderBy: { lastSyncAt: "desc" },
  });

  return NextResponse.json({
    creatives: creatives.map((c) => ({
      ...c,
      insights: JSON.parse(c.insightsJson || "{}"),
    })),
    synced: result.count,
    error: result.error,
  });
}

/* ============ Sync ============ */

async function syncCreatives(clientId: string): Promise<{ count: number; error?: string }> {
  console.log(`[Creatives Sync] Starting for client ${clientId}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "ad_account" } } },
  });

  if (!connection) return { count: 0, error: "אין חיבור Meta פעיל" };

  const adAccount = connection.assets[0];
  if (!adAccount) return { count: 0, error: "אין חשבון מודעות נבחר" };

  try {
    const ads = await metaApiGetAll<{
      id: string;
      name: string;
      status: string;
      effective_status: string;
      creative?: {
        id: string;
        name?: string;
        title?: string;
        body?: string;
        thumbnail_url?: string;
        image_url?: string;
        video_id?: string;
        link_url?: string;
        call_to_action_type?: string;
        object_story_spec?: Record<string, unknown>;
        effective_object_story_id?: string;
      };
      insights?: {
        data: Array<Record<string, unknown>>;
      };
    }>(`/${adAccount.externalId}/ads`, {
      accessToken: connection.accessToken,
      params: {
        fields: "id,name,status,effective_status,creative{id,name,title,body,thumbnail_url,image_url,video_id,link_url,call_to_action_type,object_story_spec,effective_object_story_id},insights.date_preset(this_month){spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,cost_per_action_type,conversions,cost_per_conversion,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions}",
        filtering: JSON.stringify([{
          field: "effective_status",
          operator: "IN",
          value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"],
        }]),
        limit: "200",
      },
    });

    console.log(`[Creatives Sync] Got ${ads.length} ads`);

    let count = 0;
    for (const ad of ads) {
      const cr = ad.creative;
      if (!cr) continue;
      const insights = ad.insights?.data?.[0] ?? {};

      // Get thumbnail — use creative thumbnail or image_url
      let thumbnailUrl = cr.thumbnail_url ?? cr.image_url ?? "";

      // If video, try to get thumbnail
      if (cr.video_id && !thumbnailUrl) {
        try {
          const video = await metaApiGet<{ thumbnails?: { data?: Array<{ uri: string }> } }>(
            `/${cr.video_id}`,
            { accessToken: connection.accessToken, params: { fields: "thumbnails" } }
          );
          thumbnailUrl = video.thumbnails?.data?.[0]?.uri ?? "";
        } catch {}
      }

      await prisma.metaCreative.upsert({
        where: { clientId_adId: { clientId, adId: ad.id } },
        update: {
          adName: ad.name ?? "",
          creativeName: cr.name ?? "",
          status: ad.effective_status ?? ad.status ?? "",
          body: cr.body ?? "",
          title: cr.title ?? "",
          linkUrl: cr.link_url ?? "",
          ctaType: cr.call_to_action_type ?? "",
          imageUrl: cr.image_url ?? "",
          videoId: cr.video_id ?? "",
          thumbnailUrl,
          insightsJson: JSON.stringify(insights),
          lastSyncAt: new Date(),
        },
        create: {
          clientId,
          adId: ad.id,
          adName: ad.name ?? "",
          creativeName: cr.name ?? "",
          status: ad.effective_status ?? ad.status ?? "",
          body: cr.body ?? "",
          title: cr.title ?? "",
          linkUrl: cr.link_url ?? "",
          ctaType: cr.call_to_action_type ?? "",
          imageUrl: cr.image_url ?? "",
          videoId: cr.video_id ?? "",
          thumbnailUrl,
          insightsJson: JSON.stringify(insights),
        },
      });
      count++;
    }

    console.log(`[Creatives Sync] Saved ${count} creatives`);
    return { count };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[Creatives Sync] Error:`, msg);
    return { count: 0, error: msg };
  }
}
