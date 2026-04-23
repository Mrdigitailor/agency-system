import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

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

      // אם token פג — צור התראה לאדמין
      if (stats.errors.some((e) => e.includes("TOKEN_EXPIRED"))) {
        const client = await prisma.client.findUnique({ where: { id: conn.clientId }, select: { name: true } });
        const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } });
        for (const admin of admins) {
          await prisma.alert.create({
            data: {
              type: "performance_drop",
              title: `חיבור Meta פג תוקף — ${client?.name ?? conn.clientId}`,
              message: "יש לחבר מחדש את Meta בכרטיס הלקוח",
              link: `/clients/${conn.clientId}`,
              userId: admin.id,
              clientId: conn.clientId,
            },
          });
        }
      }
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

  // === TikTok ===
  const ttConnections = await prisma.platformConnection.findMany({
    where: { platform: "tiktok", isActive: true },
    select: { clientId: true },
    distinct: ["clientId"],
  });

  for (const conn of ttConnections) {
    try {
      const stats = await syncClientTikTok(conn.clientId, 3);
      aggregate.errors.push(...stats.errors);
    } catch (err) {
      aggregate.errors.push(`tiktok ${conn.clientId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Cron] Done in ${durationMs}ms — meta: ${aggregate.metaProcessed}, gads: ${aggregate.googleAdsProcessed}, errors: ${aggregate.errors.length}`);
  return NextResponse.json({ ...aggregate, durationMs });
}
