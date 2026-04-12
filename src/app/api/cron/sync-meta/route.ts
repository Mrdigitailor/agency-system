import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";

/**
 * Cron יומי לסנכרון Meta + Google Ads — רץ כל לילה ב-03:00
 * מאובטח ב-CRON_SECRET
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");

  const expected = process.env.CRON_SECRET;
  const provided = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const aggregate = {
    metaProcessed: 0,
    googleAdsProcessed: 0,
    adInsightsFetched: 0,
    pagePostsFetched: 0,
    igMediaFetched: 0,
    googleAdsFetched: 0,
    errors: [] as string[],
  };

  // === Meta ===
  const metaConnections = await prisma.platformConnection.findMany({
    where: { platform: "meta", isActive: true },
    select: { clientId: true },
    distinct: ["clientId"],
  });

  for (const conn of metaConnections) {
    aggregate.metaProcessed++;
    try {
      const stats = await syncClientMeta(conn.clientId, 7);
      aggregate.adInsightsFetched += stats.adInsightsFetched;
      aggregate.pagePostsFetched += stats.pagePostsFetched;
      aggregate.igMediaFetched += stats.igMediaFetched;
      aggregate.errors.push(...stats.errors);
    } catch (err) {
      aggregate.errors.push(`meta ${conn.clientId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // === Google Ads ===
  const gadsConnections = await prisma.platformConnection.findMany({
    where: { platform: "google_ads", isActive: true },
    select: { clientId: true },
    distinct: ["clientId"],
  });

  for (const conn of gadsConnections) {
    aggregate.googleAdsProcessed++;
    try {
      const stats = await syncClientGoogleAds(conn.clientId, 7);
      aggregate.googleAdsFetched += stats.fetched;
      aggregate.errors.push(...stats.errors);
    } catch (err) {
      aggregate.errors.push(`google_ads ${conn.clientId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Cron] Done in ${durationMs}ms — meta: ${aggregate.metaProcessed}, gads: ${aggregate.googleAdsProcessed}, errors: ${aggregate.errors.length}`);
  return NextResponse.json({ ...aggregate, durationMs });
}
