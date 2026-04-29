import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

/**
 * GET /api/debug/test-cron
 * Runs the same logic as the cron job but with auth check (not CRON_SECRET)
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const startTime = Date.now();
  const log: string[] = [];
  const out = (msg: string) => { console.log(`[Test Cron] ${msg}`); log.push(msg); };

  out(`Started at ${new Date().toISOString()}`);
  out(`CRON_SECRET set: ${!!process.env.CRON_SECRET}`);

  const aggregate = {
    metaClients: 0, metaInsights: 0,
    gadsClients: 0, gadsFetched: 0,
    ttClients: 0, ttFetched: 0,
    errors: [] as string[],
  };

  // Meta
  const metaConns = await prisma.platformConnection.findMany({
    where: { platform: "meta", isActive: true },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  out(`Meta connections: ${metaConns.length}`);

  for (const conn of metaConns) {
    aggregate.metaClients++;
    const client = await prisma.client.findUnique({ where: { id: conn.clientId }, select: { name: true } });
    try {
      const stats = await syncClientMeta(conn.clientId, 3, true);
      out(`  Meta ${client?.name ?? conn.clientId}: ${stats.adInsightsFetched} insights, ${stats.errors.length} errors`);
      aggregate.metaInsights += stats.adInsightsFetched;
      aggregate.errors.push(...stats.errors);
    } catch (err) {
      const msg = `Meta ${conn.clientId}: ${err instanceof Error ? err.message : "unknown"}`;
      out(`  ❌ ${msg}`);
      aggregate.errors.push(msg);
    }
  }

  // Google Ads
  const gadsConns = await prisma.platformConnection.findMany({
    where: { platform: "google_ads", isActive: true },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  out(`\nGoogle Ads connections: ${gadsConns.length}`);

  for (const conn of gadsConns) {
    aggregate.gadsClients++;
    const client = await prisma.client.findUnique({ where: { id: conn.clientId }, select: { name: true } });
    try {
      const stats = await syncClientGoogleAds(conn.clientId, 3);
      out(`  Google ${client?.name ?? conn.clientId}: ${stats.fetched} rows, ${stats.errors.length} errors`);
      aggregate.gadsFetched += stats.fetched;
      aggregate.errors.push(...stats.errors);
    } catch (err) {
      const msg = `Google ${conn.clientId}: ${err instanceof Error ? err.message : "unknown"}`;
      out(`  ❌ ${msg}`);
      aggregate.errors.push(msg);
    }
  }

  // TikTok
  const ttConns = await prisma.platformConnection.findMany({
    where: { platform: "tiktok", isActive: true },
    select: { clientId: true },
    distinct: ["clientId"],
  });
  out(`\nTikTok connections: ${ttConns.length}`);

  for (const conn of ttConns) {
    aggregate.ttClients++;
    const client = await prisma.client.findUnique({ where: { id: conn.clientId }, select: { name: true } });
    try {
      const stats = await syncClientTikTok(conn.clientId, 3);
      out(`  TikTok ${client?.name ?? conn.clientId}: ${stats.fetched} rows, ${stats.errors.length} errors`);
      aggregate.ttFetched += stats.fetched;
      aggregate.errors.push(...stats.errors);
    } catch (err) {
      const msg = `TikTok ${conn.clientId}: ${err instanceof Error ? err.message : "unknown"}`;
      out(`  ❌ ${msg}`);
      aggregate.errors.push(msg);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  out(`\nCompleted in ${durationSec}s`);
  out(`Summary: Meta ${aggregate.metaInsights} insights from ${aggregate.metaClients} clients, Google ${aggregate.gadsFetched} from ${aggregate.gadsClients}, TikTok ${aggregate.ttFetched} from ${aggregate.ttClients}`);
  out(`Errors: ${aggregate.errors.length}`);

  return NextResponse.json({ log, aggregate, durationSec });
}
