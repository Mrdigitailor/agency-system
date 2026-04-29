import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

/**
 * GET /api/debug/test-cron?clientId=XXX
 * Syncs a single client (or the first one if no clientId provided)
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  let clientId = searchParams.get("clientId");

  const log: string[] = [];
  const out = (msg: string) => { console.log(`[Test Cron] ${msg}`); log.push(msg); };

  // If no clientId, pick the first connected client
  if (!clientId) {
    const first = await prisma.platformConnection.findFirst({
      where: { isActive: true },
      select: { clientId: true },
    });
    clientId = first?.clientId ?? null;
  }

  if (!clientId) {
    return NextResponse.json({ log: ["No connected clients found"], error: "no_clients" });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  out(`Syncing: ${client?.name ?? clientId} (${clientId})`);
  out(`CRON_SECRET set: ${!!process.env.CRON_SECRET}`);

  const startTime = Date.now();

  // Meta
  try {
    const stats = await syncClientMeta(clientId, 3, true);
    out(`Meta: ${stats.adInsightsFetched} insights, ${stats.pagePostsFetched} posts, ${stats.errors.length} errors`);
    if (stats.errors.length > 0) stats.errors.forEach((e) => out(`  Error: ${e}`));
  } catch (err) {
    out(`Meta error: ${err instanceof Error ? err.message : err}`);
  }

  // Google
  try {
    const stats = await syncClientGoogleAds(clientId, 3);
    out(`Google: ${stats.fetched} rows, ${stats.errors.length} errors`);
  } catch (err) {
    out(`Google error: ${err instanceof Error ? err.message : err}`);
  }

  // TikTok
  try {
    const stats = await syncClientTikTok(clientId, 3);
    out(`TikTok: ${stats.fetched} rows, ${stats.errors.length} errors`);
  } catch (err) {
    out(`TikTok error: ${err instanceof Error ? err.message : err}`);
  }

  const dur = ((Date.now() - startTime) / 1000).toFixed(1);
  out(`Done in ${dur}s`);

  return NextResponse.json({ log, clientId, clientName: client?.name, durationSec: dur });
}
