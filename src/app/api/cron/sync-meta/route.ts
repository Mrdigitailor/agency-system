import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

/**
 * Cron — runs hourly. Syncs ONE client per run (oldest lastSyncAt first).
 * Platforms synced in parallel. 25-second time guard.
 * With 24 runs/day and 21 clients, each client syncs ~1x/day.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");

  const expected = process.env.CRON_SECRET;
  const provided = authHeader?.replace("Bearer ", "") ?? querySecret;

  console.log(`[Cron] Route hit at ${new Date().toISOString()}`);

  if (expected && provided !== expected) {
    console.error("[Cron] Auth FAILED");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  // === Token renewal (quick — no API calls to ad platforms) ===
  let tokensRenewed = 0;
  try {
    const metaTokens = await prisma.platformConnection.findMany({
      where: { platform: "meta", isActive: true, tokenExpiry: { not: null, lt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } },
      select: { id: true, accessToken: true, tokenExpiry: true, accountName: true },
    });
    for (const conn of metaTokens) {
      try {
        const res = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION ?? "v21.0"}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${conn.accessToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            await prisma.platformConnection.update({ where: { id: conn.id }, data: { accessToken: data.access_token, tokenExpiry: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000) } });
            tokensRenewed++;
          }
        }
      } catch {}
    }

    const googleTokens = await prisma.platformConnection.findMany({
      where: { platform: "google_ads", isActive: true, refreshToken: { not: "" }, tokenExpiry: { lt: new Date() } },
      select: { id: true, refreshToken: true },
    });
    for (const conn of googleTokens) {
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: conn.refreshToken, grant_type: "refresh_token" }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            await prisma.platformConnection.update({ where: { id: conn.id }, data: { accessToken: data.access_token, tokenExpiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000) } });
            tokensRenewed++;
          }
        }
      } catch {}
    }
  } catch {}

  // === Find the ONE client to sync (oldest lastSyncAt) ===
  const allConnections = await prisma.platformConnection.findMany({
    where: { isActive: true },
    select: { clientId: true, platform: true, lastSyncAt: true },
  });

  const clientMap = new Map<string, { platforms: string[]; oldestSync: Date | null }>();
  for (const conn of allConnections) {
    const existing = clientMap.get(conn.clientId);
    if (existing) {
      existing.platforms.push(conn.platform);
      if (!existing.oldestSync || (conn.lastSyncAt && conn.lastSyncAt < existing.oldestSync)) {
        existing.oldestSync = conn.lastSyncAt;
      }
    } else {
      clientMap.set(conn.clientId, { platforms: [conn.platform], oldestSync: conn.lastSyncAt });
    }
  }

  // Sort: never-synced first, then oldest
  const sorted = Array.from(clientMap.entries()).sort(([, a], [, b]) => {
    if (!a.oldestSync) return -1;
    if (!b.oldestSync) return 1;
    return a.oldestSync.getTime() - b.oldestSync.getTime();
  });

  if (sorted.length === 0) {
    return NextResponse.json({ ok: true, message: "No clients to sync", tokensRenewed });
  }

  // Pick first (oldest) client
  const [clientId, { platforms }] = sorted[0];
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const clientName = client?.name ?? clientId;

  console.log(`[Cron] Syncing: ${clientName} [${platforms.join("+")}] (${sorted.length} total clients)`);

  // === Sync all platforms in parallel ===
  const results = await Promise.all([
    platforms.includes("meta")
      ? syncClientMeta(clientId, 3).then((s) => ({ platform: "meta", rows: s.adInsightsFetched, errors: s.errors })).catch((e) => ({ platform: "meta", rows: 0, errors: [String(e)] }))
      : Promise.resolve(null),
    platforms.includes("google_ads")
      ? syncClientGoogleAds(clientId, 3).then((s) => ({ platform: "google", rows: s.fetched, errors: s.errors })).catch((e) => ({ platform: "google", rows: 0, errors: [String(e)] }))
      : Promise.resolve(null),
    platforms.includes("tiktok")
      ? syncClientTikTok(clientId).then((s) => ({ platform: "tiktok", rows: s.fetched, errors: s.errors })).catch((e) => ({ platform: "tiktok", rows: 0, errors: [String(e)] }))
      : Promise.resolve(null),
  ]);

  const syncResults = results.filter(Boolean) as Array<{ platform: string; rows: number; errors: string[] }>;
  const metaRows = syncResults.find((r) => r.platform === "meta")?.rows ?? 0;
  const googleRows = syncResults.find((r) => r.platform === "google")?.rows ?? 0;
  const tiktokRows = syncResults.find((r) => r.platform === "tiktok")?.rows ?? 0;
  const errors = syncResults.flatMap((r) => r.errors);

  // Alert on token expired
  if (errors.some((e) => e.includes("TOKEN_EXPIRED"))) {
    const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } });
    for (const admin of admins) {
      await prisma.alert.create({
        data: { type: "performance_drop", title: `חיבור פג — ${clientName}`, message: "יש לחבר מחדש", link: `/clients/${clientId}`, userId: admin.id, clientId },
      }).catch(() => {});
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Cron] Done: ${clientName} | meta=${metaRows} google=${googleRows} tiktok=${tiktokRows} | ${durationSec}s | errors=${errors.length}`);

  return NextResponse.json({
    ok: true,
    client: clientName,
    meta: metaRows,
    google: googleRows,
    tiktok: tiktokRows,
    errors: errors.length,
    tokensRenewed,
    duration: durationSec,
    totalClients: sorted.length,
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
