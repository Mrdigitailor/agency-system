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
  console.log(`[Cron] ========== STARTED at ${new Date().toISOString()} ==========`);
  const aggregate = {
    metaProcessed: 0,
    googleAdsProcessed: 0,
    adInsightsFetched: 0,
    pagePostsFetched: 0,
    igMediaFetched: 0,
    googleAdsFetched: 0,
    tokensRenewed: 0,
    errors: [] as string[],
  };

  // === שלב 0: חידוש Tokens ===
  console.log("[Cron] Step 0: Token renewal");

  // Meta — חידוש long-lived token אם פג תוך 7 ימים
  const metaTokens = await prisma.platformConnection.findMany({
    where: { platform: "meta", isActive: true, tokenExpiry: { not: null } },
    select: { id: true, accessToken: true, tokenExpiry: true, accountName: true },
  });
  const fourteenDaysFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  console.log(`[Cron] Checking ${metaTokens.length} Meta connections for token renewal (14-day window)`);
  for (const conn of metaTokens) {
    const daysLeft = Math.round((conn.tokenExpiry!.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    console.log(`[Cron] Meta ${conn.accountName}: expires ${conn.tokenExpiry!.toISOString()} (${daysLeft} days left)`);
    if (conn.tokenExpiry! < fourteenDaysFromNow) {
      console.log(`[Cron] Renewing token for ${conn.accountName} (${daysLeft} days left)...`);
      try {
        const res = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION ?? "v21.0"}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${conn.accessToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            const newExpiry = new Date(Date.now() + (data.expires_in ?? 5184000) * 1000);
            await prisma.platformConnection.update({
              where: { id: conn.id },
              data: { accessToken: data.access_token, tokenExpiry: newExpiry },
            });
            console.log(`[Cron] ✅ Meta token renewed, new expiry: ${newExpiry.toISOString()}`);
            aggregate.tokensRenewed++;
          }
        }
      } catch (err) {
        console.error(`[Cron] Meta token renewal failed:`, err);
      }
    }
  }

  // Google — רענון access_token עם refresh_token
  const googleTokens = await prisma.platformConnection.findMany({
    where: { platform: "google_ads", isActive: true },
    select: { id: true, refreshToken: true, tokenExpiry: true, accountName: true },
  });
  for (const conn of googleTokens) {
    if (conn.refreshToken && conn.tokenExpiry && conn.tokenExpiry < new Date()) {
      console.log(`[Cron] Google token for ${conn.accountName} expired — refreshing`);
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID ?? "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            refresh_token: conn.refreshToken,
            grant_type: "refresh_token",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            await prisma.platformConnection.update({
              where: { id: conn.id },
              data: { accessToken: data.access_token, tokenExpiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000) },
            });
            console.log(`[Cron] ✅ Google token refreshed`);
            aggregate.tokensRenewed++;
          }
        }
      } catch (err) {
        console.error(`[Cron] Google token refresh failed:`, err);
      }
    }
  }

  console.log(`[Cron] Token renewal done: ${aggregate.tokensRenewed} renewed`);

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
  console.log(`[Cron] ========== COMPLETED in ${(durationMs / 1000).toFixed(1)}s ==========`);
  console.log(`[Cron] Meta: ${aggregate.metaProcessed} clients, ${aggregate.adInsightsFetched} insights`);
  console.log(`[Cron] Google: ${aggregate.googleAdsProcessed} clients, ${aggregate.googleAdsFetched} rows`);
  console.log(`[Cron] Tokens renewed: ${aggregate.tokensRenewed}`);
  console.log(`[Cron] Errors: ${aggregate.errors.length}`);
  if (aggregate.errors.length > 0) aggregate.errors.forEach((e) => console.error(`[Cron] Error: ${e}`));
  return NextResponse.json({ ...aggregate, durationMs });
}
