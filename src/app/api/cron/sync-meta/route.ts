import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { fetchAdInsights, extractMetrics } from "@/lib/api/meta/ad-insights";
import { searchStream, getValidGoogleToken } from "@/lib/api/google-ads/client";
import { fetchCampaignReport } from "@/lib/api/tiktok/client";
import type { MetaInsight } from "@/lib/api/meta/ad-insights";

/**
 * Cron — runs hourly. Syncs ONE connection, ONE day (yesterday).
 * Designed for Vercel Hobby 10-second limit.
 * No posts, no IG, no page sync — just ad insights.
 */
export async function GET(req: Request) {
  console.log(`[Cron] Hit at ${new Date().toISOString()}`);

  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  const querySecret = new URL(req.url).searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (expected && authHeader !== expected && querySecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Self-healing: המפעיל השעתי החיצוני אמין יותר מה-cron של Vercel (שמושהה כשחורגים ממכסות).
  // אם הסנכרון המלא (sync-all) לא רץ ב-22 השעות האחרונות — מפעילים אותו מכאן.
  // אם הסנכרון רץ אבל ניתוח הבוקר (detect) לא רץ 26 שעות — מפעילים גם אותו.
  try {
    const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
    const lastOf = async (job: string) => {
      const r = await prisma.cronRun.findFirst({ where: { job }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      return r ? (Date.now() - r.createdAt.getTime()) / 3600000 : Infinity;
    };
    const hoursSince = await lastOf("sync-all");
    if (hoursSince >= 22) {
      console.log(`[Cron sync-meta] sync-all לא רץ ${Math.round(hoursSince)} שעות — מפעיל self-heal`);
      fetch(`${origin}/api/cron/sync-all?src=self-heal`, { headers: { authorization: `Bearer ${expected ?? ""}` } }).catch(() => {});
      return NextResponse.json({ ok: true, selfHealed: true, hoursSinceFullSync: Math.round(hoursSince) });
    }
    const detectHours = await lastOf("detect");
    if (detectHours >= 26 && hoursSince >= 0.5) {
      console.log(`[Cron sync-meta] detect לא רץ ${Math.round(detectHours)} שעות — מפעיל self-heal`);
      fetch(`${origin}/api/cron/detect?src=self-heal`, { method: "POST", headers: { authorization: `Bearer ${expected ?? ""}` } }).catch(() => {});
    }
  } catch (e) {
    console.error("[Cron sync-meta] self-heal check failed:", e);
  }

  const startTime = Date.now();

  // Yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  // Find oldest connection (skip inactive clients)
  const conn = await prisma.platformConnection.findFirst({
    where: {
      isActive: true,
      client: { status: { not: "inactive" }, deletedAt: null },
    },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    include: { client: { select: { name: true } }, assets: { where: { isSelected: true } } },
  });

  if (!conn) {
    return NextResponse.json({ ok: true, message: "No connections" });
  }

  const clientName = conn.client?.name ?? conn.clientId;
  console.log(`[Cron] ${clientName} / ${conn.platform} / ${dateStr}`);

  let rows = 0;
  let error = "";

  try {
    if (conn.platform === "meta") {
      rows = await syncMetaQuick(conn.clientId, conn.accessToken, conn.assets, dateStr);
    } else if (conn.platform === "google_ads") {
      rows = await syncGoogleQuick(conn.clientId, conn.id, conn.accessToken, conn.refreshToken, conn.tokenExpiry, conn.assets, dateStr);
    } else if (conn.platform === "tiktok") {
      rows = await syncTikTokQuick(conn.clientId, conn.accessToken, conn.assets, dateStr);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error(`[Cron] Error: ${error}`);
  }

  // Always update lastSyncAt to rotate
  await prisma.platformConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date() },
  });

  const dur = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Cron] Done: ${rows} rows in ${dur}s`);

  return NextResponse.json({
    ok: !error,
    client: clientName,
    platform: conn.platform,
    date: dateStr,
    rows,
    error: error || undefined,
    duration: dur,
  });
}

// === Quick sync functions — single API call each ===

async function syncMetaQuick(
  clientId: string,
  accessToken: string,
  assets: Array<{ id: string; assetType: string; externalId: string }>,
  date: string,
): Promise<number> {
  const adAccount = assets.find((a) => a.assetType === "ad_account");
  if (!adAccount) return 0;

  const insights: MetaInsight[] = await fetchAdInsights(
    adAccount.externalId, accessToken, "campaign", date, date, true
  );

  for (const ins of insights) {
    const m = extractMetrics(ins);
    await prisma.metaInsightDaily.upsert({
      where: {
        assetId_level_externalId_date: {
          assetId: adAccount.id, level: "campaign",
          externalId: ins.campaign_id ?? "", date: ins.date_start,
        },
      },
      update: {
        name: ins.campaign_name ?? "",
        spend: parseFloat(ins.spend) || 0,
        impressions: parseInt(ins.impressions) || 0,
        clicks: parseInt(ins.clicks) || 0,
        reach: parseInt(ins.reach) || 0,
        conversions: m.conversions,
        costPerConversion: m.costPerConversion,
        purchaseValue: m.purchaseValue,
        roas: m.roas,
        leads: m.leads,
        costPerLead: m.costPerLead,
        purchases: m.purchases,
        actionsJson: JSON.stringify(ins),
      },
      create: {
        clientId, assetId: adAccount.id, level: "campaign",
        externalId: ins.campaign_id ?? "", parentId: "",
        date: ins.date_start,
        name: ins.campaign_name ?? "",
        spend: parseFloat(ins.spend) || 0,
        impressions: parseInt(ins.impressions) || 0,
        clicks: parseInt(ins.clicks) || 0,
        reach: parseInt(ins.reach) || 0,
        conversions: m.conversions,
        costPerConversion: m.costPerConversion,
        purchaseValue: m.purchaseValue,
        roas: m.roas,
        leads: m.leads,
        costPerLead: m.costPerLead,
        purchases: m.purchases,
        actionsJson: JSON.stringify(ins),
      },
    });
  }

  return insights.length;
}

async function syncGoogleQuick(
  clientId: string,
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  tokenExpiry: Date | null,
  assets: Array<{ id: string; assetType: string; externalId: string; extraData: string }>,
  date: string,
): Promise<number> {
  const account = assets.find((a) => a.assetType === "google_ads_account");
  if (!account) return 0;

  // וודא טוקן תקף — מרענן ושומר ל-DB דרך getValidGoogleToken
  const token = await getValidGoogleToken({
    id: connectionId,
    accessToken,
    refreshToken,
    tokenExpiry,
  });

  const extra = JSON.parse(account.extraData || "{}");
  const mccId = extra.mccId ?? "";

  const query = `SELECT campaign.id, campaign.name, campaign.status,
    metrics.cost_micros, metrics.impressions, metrics.clicks,
    metrics.conversions, metrics.conversions_value, segments.date
    FROM campaign WHERE segments.date = '${date}'`;

  const results = await searchStream(account.externalId, query, {
    accessToken: token, loginCustomerId: mccId || undefined,
  });

  // פירוט המרות לפי conversion action ליום זה — לא חוסם אם נכשל
  const actionMap = new Map<string, Record<string, number>>();
  try {
    const actionRows = await searchStream(account.externalId, `SELECT campaign.id, segments.conversion_action_name, metrics.conversions FROM campaign WHERE segments.date = '${date}' AND metrics.conversions > 0`, {
      accessToken: token, loginCustomerId: mccId || undefined,
    });
    for (const row of actionRows) {
      const cid = String(row.campaign?.id ?? "");
      const an = row.segments?.conversionActionName ?? "";
      if (!cid || !an) continue;
      const entry = actionMap.get(cid) ?? {};
      entry[an] = (entry[an] ?? 0) + Number(row.metrics?.conversions ?? 0);
      actionMap.set(cid, entry);
    }
  } catch { /* ignore */ }

  for (const row of results) {
    const c = row.campaign ?? {};
    const m = row.metrics ?? {};
    const campaignId = String(c.id ?? "");
    if (!campaignId) continue;
    const conversionsByAction = JSON.stringify(actionMap.get(campaignId) ?? {});

    await prisma.googleAdsInsightDaily.upsert({
      where: { assetId_campaignId_date: { assetId: account.id, campaignId, date } },
      update: {
        campaignName: c.name ?? "",
        spend: Number(m.costMicros ?? 0) / 1_000_000,
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        conversions: Number(m.conversions ?? 0),
        conversionsValue: Number(m.conversionsValue ?? 0),
        conversionsByAction,
      },
      create: {
        clientId, assetId: account.id, campaignId, date,
        campaignName: c.name ?? "",
        spend: Number(m.costMicros ?? 0) / 1_000_000,
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        conversions: Number(m.conversions ?? 0),
        conversionsValue: Number(m.conversionsValue ?? 0),
        conversionsByAction,
      },
    });
  }

  return results.length;
}

async function syncTikTokQuick(
  clientId: string,
  accessToken: string,
  assets: Array<{ id: string; assetType: string; externalId: string }>,
  date: string,
): Promise<number> {
  const account = assets.find((a) => a.assetType === "tiktok_ad_account");
  if (!account) return 0;

  const rows = await fetchCampaignReport(account.externalId, accessToken, date, date);

  for (const row of rows) {
    const campaignId = String(row.campaign_id ?? "");
    const rowDate = String(row.stat_time_day ?? "").split(" ")[0];
    if (!campaignId || !rowDate) continue;

    await prisma.tikTokInsightDaily.upsert({
      where: { assetId_campaignId_date: { assetId: account.id, campaignId, date: rowDate } },
      update: {
        spend: parseFloat(String(row.spend ?? "0")) || 0,
        impressions: parseInt(String(row.impressions ?? "0")) || 0,
        clicks: parseInt(String(row.clicks ?? "0")) || 0,
        conversions: parseInt(String(row.conversion ?? "0")) || 0,
      },
      create: {
        clientId, assetId: account.id, campaignId, date: rowDate,
        spend: parseFloat(String(row.spend ?? "0")) || 0,
        impressions: parseInt(String(row.impressions ?? "0")) || 0,
        clicks: parseInt(String(row.clicks ?? "0")) || 0,
        conversions: parseInt(String(row.conversion ?? "0")) || 0,
      },
    });
  }

  return rows.length;
}

export const dynamic = "force-dynamic";
