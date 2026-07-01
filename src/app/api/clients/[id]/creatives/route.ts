import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { metaApiGetAll, metaApiGet } from "@/lib/api/meta/client";
import { countConversions } from "@/lib/utils/metaMetrics";

export const maxDuration = 60;

const STALE_MS = 10 * 60 * 1000; // 10 min
const WINDOW_DAYS = 45; // כמה ימים אחורה נשמרים יומית — תומך בבורר תאריכים עד 45 יום

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isYmd(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function defaultRange(): { since: string; until: string } {
  const now = new Date();
  return { since: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, until: toDateStr(now) };
}

/**
 * GET /api/clients/[id]/creatives?since=&until= — נתוני קריאייטיבים לטווח נבחר.
 * POST — סנכרון יזום.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId } = await params;
  const url = new URL(req.url);
  const since = isYmd(url.searchParams.get("since")) ? url.searchParams.get("since")! : defaultRange().since;
  const until = isYmd(url.searchParams.get("until")) ? url.searchParams.get("until")! : defaultRange().until;

  const latest = await prisma.metaCreative.findFirst({ where: { clientId }, orderBy: { lastSyncAt: "desc" }, select: { lastSyncAt: true } });
  const isStale = !latest || Date.now() - latest.lastSyncAt.getTime() > STALE_MS;
  const count = await prisma.metaCreative.count({ where: { clientId } });

  if (count === 0) {
    const result = await syncCreatives(clientId);
    if (result.error) return NextResponse.json({ creatives: [], error: result.error });
  } else if (isStale) {
    syncCreatives(clientId).catch(() => {});
  }

  const creatives = await aggregateCreatives(clientId, since, until);
  return NextResponse.json({ creatives, range: { since, until } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId } = await params;
  const body = await req.json().catch(() => ({} as Record<string, string>));
  const since = isYmd(body.since) ? body.since : defaultRange().since;
  const until = isYmd(body.until) ? body.until : defaultRange().until;

  const result = await syncCreatives(clientId);
  const creatives = await aggregateCreatives(clientId, since, until);
  return NextResponse.json({ creatives, range: { since, until }, synced: result.count, error: result.error });
}

/* ============ צבירה לפי טווח ============ */

async function aggregateCreatives(clientId: string, since: string, until: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { metaConversionEvent: true } });
  const selectedEvent = client?.metaConversionEvent ?? "";

  const [metas, daily] = await Promise.all([
    prisma.metaCreative.findMany({ where: { clientId }, orderBy: { lastSyncAt: "desc" } }),
    prisma.metaCreativeDaily.findMany({ where: { clientId, date: { gte: since, lte: until } } }),
  ]);

  // קיבוץ יומי לפי adId
  const byAd = new Map<string, typeof daily>();
  for (const d of daily) {
    if (!byAd.has(d.adId)) byAd.set(d.adId, []);
    byAd.get(d.adId)!.push(d);
  }

  const vid = (v: number) => (v > 0 ? [{ action_type: "video_view", value: String(v) }] : []);

  return metas.map((m) => {
    const rows = byAd.get(m.adId) ?? [];
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const reach = rows.reduce((s, r) => s + r.reach, 0);
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const inline_link_clicks = rows.reduce((s, r) => s + r.inlineLinkClicks, 0);
    const conversions = countConversions(rows.map((r) => ({ spend: r.spend, conversions: r.conversions, purchases: 0, leads: 0, actionsJson: r.actionsJson })), selectedEvent);
    const vp25 = rows.reduce((s, r) => s + r.vp25, 0);
    const vp50 = rows.reduce((s, r) => s + r.vp50, 0);
    const vp75 = rows.reduce((s, r) => s + r.vp75, 0);
    const vp100 = rows.reduce((s, r) => s + r.vp100, 0);

    return {
      id: m.id,
      adId: m.adId,
      adName: m.adName,
      creativeName: m.creativeName,
      status: m.status,
      body: m.body,
      title: m.title,
      linkUrl: m.linkUrl,
      ctaType: m.ctaType,
      imageUrl: m.imageUrl,
      videoId: m.videoId,
      videoUrl: m.videoUrl,
      thumbnailUrl: m.thumbnailUrl,
      previewHtml: m.previewHtml,
      campaignName: m.campaignName,
      adsetName: m.adsetName,
      insights: {
        spend,
        impressions,
        reach,
        clicks,
        inline_link_clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        conversions,
        cost_per_conversion: conversions > 0 ? spend / conversions : 0,
        video_p25_watched_actions: vid(vp25),
        video_p50_watched_actions: vid(vp50),
        video_p75_watched_actions: vid(vp75),
        video_p100_watched_actions: vid(vp100),
      },
    };
  });
}

/* ============ Sync ============ */

const vv = (arr?: Array<{ value: string }>): number => (arr?.[0]?.value ? parseInt(arr[0].value, 10) || 0 : 0);

async function syncCreatives(clientId: string): Promise<{ count: number; error?: string }> {
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "ad_account" } } },
  });
  if (!connection) return { count: 0, error: "אין חיבור Meta פעיל" };
  const adAccount = connection.assets[0];
  if (!adAccount) return { count: 0, error: "אין חשבון מודעות נבחר" };

  const now = new Date();
  const since = toDateStr(new Date(now.getTime() - (WINDOW_DAYS - 1) * 86400000));
  const until = toDateStr(now);
  const timeRange = JSON.stringify({ since, until });

  try {
    const ads = await metaApiGetAll<{
      id: string;
      name: string;
      status: string;
      effective_status: string;
      creative?: {
        id: string; name?: string; title?: string; body?: string; thumbnail_url?: string; image_url?: string;
        video_id?: string; link_url?: string; call_to_action_type?: string; object_story_spec?: Record<string, unknown>; effective_object_story_id?: string;
      };
      insights?: { data: Array<Record<string, unknown>> };
    }>(`/${adAccount.externalId}/ads`, {
      accessToken: connection.accessToken,
      params: {
        fields: `id,name,status,effective_status,creative{id,name,title,body,thumbnail_url,image_url,video_id,link_url,call_to_action_type,object_story_spec,effective_object_story_id},insights.time_range(${timeRange}).time_increment(1){spend,impressions,reach,clicks,inline_link_clicks,actions,conversions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions}`,
        filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"] }]),
        limit: "200",
      },
    });

    const dailyRows: Array<{ clientId: string; adId: string; date: string; spend: number; impressions: number; reach: number; clicks: number; inlineLinkClicks: number; conversions: number; actionsJson: string; vp25: number; vp50: number; vp75: number; vp100: number }> = [];
    let count = 0;

    for (const ad of ads) {
      const cr = ad.creative;
      if (!cr) continue;

      // תמונה — כמו קודם
      let imageUrl = cr.image_url ?? "";
      let thumbnailUrl = cr.thumbnail_url ?? "";
      if (!imageUrl && cr.object_story_spec) {
        const spec = cr.object_story_spec as Record<string, any>;
        imageUrl = spec?.link_data?.picture ?? spec?.photo_data?.images?.[0]?.source ?? spec?.video_data?.image_url ?? "";
      }
      if (cr.video_id && !imageUrl) {
        try {
          const video = await metaApiGet<{ thumbnails?: { data?: Array<{ uri: string }> } }>(`/${cr.video_id}`, { accessToken: connection.accessToken, params: { fields: "source,thumbnails" } });
          thumbnailUrl = video.thumbnails?.data?.[0]?.uri ?? thumbnailUrl;
        } catch {}
      }
      const bestImage = imageUrl || thumbnailUrl;

      await prisma.metaCreative.upsert({
        where: { clientId_adId: { clientId, adId: ad.id } },
        update: {
          adName: ad.name ?? "", creativeName: cr.name ?? "", status: ad.effective_status ?? ad.status ?? "",
          body: cr.body ?? "", title: cr.title ?? "", linkUrl: cr.link_url ?? "", ctaType: cr.call_to_action_type ?? "",
          imageUrl: bestImage, videoId: cr.video_id ?? "", thumbnailUrl, lastSyncAt: new Date(),
        },
        create: {
          clientId, adId: ad.id, adName: ad.name ?? "", creativeName: cr.name ?? "", status: ad.effective_status ?? ad.status ?? "",
          body: cr.body ?? "", title: cr.title ?? "", linkUrl: cr.link_url ?? "", ctaType: cr.call_to_action_type ?? "",
          imageUrl: bestImage, videoId: cr.video_id ?? "", thumbnailUrl,
        },
      });
      count++;

      for (const row of ad.insights?.data ?? []) {
        const date = (row.date_start as string) ?? "";
        if (!date) continue;
        dailyRows.push({
          clientId, adId: ad.id, date,
          spend: parseFloat(String(row.spend ?? 0)) || 0,
          impressions: parseInt(String(row.impressions ?? 0), 10) || 0,
          reach: parseInt(String(row.reach ?? 0), 10) || 0,
          clicks: parseInt(String(row.clicks ?? 0), 10) || 0,
          inlineLinkClicks: parseInt(String(row.inline_link_clicks ?? 0), 10) || 0,
          conversions: parseInt(String(row.conversions ?? 0), 10) || 0,
          actionsJson: JSON.stringify({ actions: (row.actions as unknown[]) ?? [] }),
          vp25: vv(row.video_p25_watched_actions as Array<{ value: string }>),
          vp50: vv(row.video_p50_watched_actions as Array<{ value: string }>),
          vp75: vv(row.video_p75_watched_actions as Array<{ value: string }>),
          vp100: vv(row.video_p100_watched_actions as Array<{ value: string }>),
        });
      }
    }

    // החלפה בכמות (bulk) של החלון — מהיר מ-upsert פר-שורה
    await prisma.metaCreativeDaily.deleteMany({ where: { clientId, date: { gte: since, lte: until } } });
    if (dailyRows.length > 0) {
      await prisma.metaCreativeDaily.createMany({ data: dailyRows });
    }

    console.log(`[Creatives Sync] ${count} creatives, ${dailyRows.length} daily rows (${since}→${until})`);
    return { count };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[Creatives Sync] Error:`, msg);
    return { count: 0, error: msg };
  }
}
