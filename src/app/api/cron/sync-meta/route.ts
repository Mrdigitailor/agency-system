import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

/**
 * Cron — runs hourly. Syncs ONE connection (client+platform) per run.
 * Picks the oldest lastSyncAt. Each run takes 5-15 seconds.
 */
export async function GET(req: Request) {
  console.log(`[Cron] Route hit at ${new Date().toISOString()}`);

  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  const querySecret = new URL(req.url).searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (expected && authHeader !== expected && querySecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  // === Token renewal (fast) ===
  let tokensRenewed = 0;
  try {
    // Meta — renew if expiring within 14 days
    const metaExpiring = await prisma.platformConnection.findMany({
      where: { platform: "meta", isActive: true, tokenExpiry: { not: null, lt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } },
      select: { id: true, accessToken: true },
    });
    for (const conn of metaExpiring) {
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

    // Google — refresh expired tokens
    const googleExpired = await prisma.platformConnection.findMany({
      where: { platform: "google_ads", isActive: true, refreshToken: { not: "" }, tokenExpiry: { lt: new Date() } },
      select: { id: true, refreshToken: true },
    });
    for (const conn of googleExpired) {
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

  // === Find ONE connection to sync (oldest lastSyncAt, skip inactive clients) ===
  const connection = await prisma.platformConnection.findFirst({
    where: {
      isActive: true,
      client: { status: { not: "inactive" }, deletedAt: null },
    },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    include: { client: { select: { name: true } } },
  });

  if (!connection) {
    return NextResponse.json({ ok: true, message: "No connections to sync", tokensRenewed });
  }

  const clientName = connection.client?.name ?? connection.clientId;
  console.log(`[Cron] Syncing: ${clientName} / ${connection.platform} (lastSync: ${connection.lastSyncAt?.toISOString() ?? "never"})`);

  // === Sync the single connection ===
  let rows = 0;
  const errors: string[] = [];

  try {
    if (connection.platform === "meta") {
      const stats = await syncClientMeta(connection.clientId, 3);
      rows = stats.adInsightsFetched;
      errors.push(...stats.errors);
    } else if (connection.platform === "google_ads") {
      const stats = await syncClientGoogleAds(connection.clientId, 3);
      rows = stats.fetched;
      errors.push(...stats.errors);
    } else if (connection.platform === "tiktok") {
      const stats = await syncClientTikTok(connection.clientId);
      rows = stats.fetched;
      errors.push(...stats.errors);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // Update lastSyncAt regardless of success (so we move to next connection)
  await prisma.platformConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  // Alert on token expired
  if (errors.some((e) => e.includes("TOKEN_EXPIRED"))) {
    const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } });
    for (const admin of admins) {
      await prisma.alert.create({
        data: { type: "performance_drop", title: `חיבור פג — ${clientName}`, message: "יש לחבר מחדש", link: `/clients/${connection.clientId}`, userId: admin.id, clientId: connection.clientId },
      }).catch(() => {});
    }
  }

  const dur = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Cron] Done: ${clientName}/${connection.platform} = ${rows} rows in ${dur}s | errors: ${errors.length}`);

  // Count total connections for info
  const totalConns = await prisma.platformConnection.count({
    where: { isActive: true, client: { status: { not: "inactive" }, deletedAt: null } },
  });

  return NextResponse.json({
    ok: true,
    client: clientName,
    platform: connection.platform,
    rows,
    errors: errors.length,
    tokensRenewed,
    duration: dur,
    totalConnections: totalConns,
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
