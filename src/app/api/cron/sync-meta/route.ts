import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

const MAX_TIME_MS = 50000; // 50s — leave 10s for token renewal + response

/**
 * Cron — רץ כל שעה. מסנכרן את הלקוחות שהכי מזמן לא סונכרנו.
 * כל ריצה מסנכרנת כמה שאפשר בתוך 50 שניות.
 * פלטפורמות רצות במקביל (Promise.all) לחיסכון זמן.
 */
export async function GET(req: Request) {
  console.log(`[Cron] Route hit at ${new Date().toISOString()}`);

  // Vercel cron authentication
  const authHeader = req.headers.get("authorization");
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");

  const expected = process.env.CRON_SECRET;
  const provided = authHeader?.replace("Bearer ", "") ?? querySecret;

  console.log(`[Cron] Auth: expected=${expected ? "set" : "NOT SET"}, provided=${provided ? provided.slice(0, 8) + "..." : "none"}, header=${authHeader ? "yes" : "no"}`);

  if (!expected) {
    console.warn("[Cron] CRON_SECRET not set — running without auth");
  } else if (provided !== expected) {
    console.error("[Cron] Auth FAILED — returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const timeLeft = () => MAX_TIME_MS - (Date.now() - startTime);
  console.log(`[Cron] ========== STARTED at ${new Date().toISOString()} ==========`);

  const aggregate = {
    clientsSynced: 0,
    tokensRenewed: 0,
    metaInsights: 0,
    googleRows: 0,
    tiktokRows: 0,
    errors: [] as string[],
    skippedTimeLimit: 0,
  };

  // === Step 0: Token renewal (Meta + Google) ===
  try {
    const metaTokens = await prisma.platformConnection.findMany({
      where: { platform: "meta", isActive: true, tokenExpiry: { not: null } },
      select: { id: true, accessToken: true, tokenExpiry: true, accountName: true },
    });
    const fourteenDays = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    for (const conn of metaTokens) {
      if (conn.tokenExpiry && conn.tokenExpiry < fourteenDays) {
        try {
          const res = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION ?? "v21.0"}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${conn.accessToken}`);
          if (res.ok) {
            const data = await res.json();
            if (data.access_token) {
              await prisma.platformConnection.update({
                where: { id: conn.id },
                data: { accessToken: data.access_token, tokenExpiry: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000) },
              });
              aggregate.tokensRenewed++;
            }
          }
        } catch {}
      }
    }

    const googleTokens = await prisma.platformConnection.findMany({
      where: { platform: "google_ads", isActive: true, refreshToken: { not: "" } },
      select: { id: true, refreshToken: true, tokenExpiry: true },
    });
    for (const conn of googleTokens) {
      if (conn.tokenExpiry && conn.tokenExpiry < new Date()) {
        try {
          const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: conn.refreshToken, grant_type: "refresh_token" }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.access_token) {
              await prisma.platformConnection.update({
                where: { id: conn.id },
                data: { accessToken: data.access_token, tokenExpiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000) },
              });
              aggregate.tokensRenewed++;
            }
          }
        } catch {}
      }
    }
  } catch {}
  console.log(`[Cron] Tokens renewed: ${aggregate.tokensRenewed}`);

  // === Step 1: Find clients sorted by oldest sync ===
  const allConnections = await prisma.platformConnection.findMany({
    where: { isActive: true },
    select: { clientId: true, platform: true, lastSyncAt: true },
  });

  // Group by clientId, track oldest sync
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

  // Sort: null (never synced) first, then oldest first
  const sortedClients = Array.from(clientMap.entries()).sort(([, a], [, b]) => {
    if (!a.oldestSync) return -1;
    if (!b.oldestSync) return 1;
    return a.oldestSync.getTime() - b.oldestSync.getTime();
  });

  console.log(`[Cron] ${sortedClients.length} clients to sync (oldest first)`);

  // === Step 2: Sync clients — parallel platforms, sequential clients ===
  for (const [clientId, { platforms }] of sortedClients) {
    if (timeLeft() < 5000) {
      aggregate.skippedTimeLimit = sortedClients.length - aggregate.clientsSynced;
      console.log(`[Cron] Time limit — ${aggregate.skippedTimeLimit} clients skipped`);
      break;
    }

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    const clientName = client?.name ?? clientId;
    console.log(`[Cron] Syncing ${clientName} [${platforms.join("+")}]...`);

    const syncTasks: Promise<{ platform: string; rows: number; errors: string[] }>[] = [];

    if (platforms.includes("meta")) {
      syncTasks.push(
        syncClientMeta(clientId, 3).then((s) => ({ platform: "meta", rows: s.adInsightsFetched, errors: s.errors })).catch((e) => ({ platform: "meta", rows: 0, errors: [e instanceof Error ? e.message : "unknown"] }))
      );
    }
    if (platforms.includes("google_ads")) {
      syncTasks.push(
        syncClientGoogleAds(clientId, 3).then((s) => ({ platform: "google", rows: s.fetched, errors: s.errors })).catch((e) => ({ platform: "google", rows: 0, errors: [e instanceof Error ? e.message : "unknown"] }))
      );
    }
    if (platforms.includes("tiktok")) {
      syncTasks.push(
        syncClientTikTok(clientId).then((s) => ({ platform: "tiktok", rows: s.fetched, errors: s.errors })).catch((e) => ({ platform: "tiktok", rows: 0, errors: [e instanceof Error ? e.message : "unknown"] }))
      );
    }

    const results = await Promise.all(syncTasks);
    let clientLog = `  ${clientName}:`;
    for (const r of results) {
      if (r.platform === "meta") aggregate.metaInsights += r.rows;
      if (r.platform === "google") aggregate.googleRows += r.rows;
      if (r.platform === "tiktok") aggregate.tiktokRows += r.rows;
      aggregate.errors.push(...r.errors);
      clientLog += ` ${r.platform}=${r.rows}`;
      if (r.errors.length > 0) clientLog += `(${r.errors.length} err)`;
    }
    console.log(`[Cron] ${clientLog}`);

    // Alert on token expired
    if (results.some((r) => r.errors.some((e) => e.includes("TOKEN_EXPIRED")))) {
      const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } });
      for (const admin of admins) {
        await prisma.alert.create({
          data: {
            type: "performance_drop",
            title: `חיבור פג תוקף — ${clientName}`,
            message: "יש לחבר מחדש את הפלטפורמה בכרטיס הלקוח",
            link: `/clients/${clientId}`,
            userId: admin.id,
            clientId,
          },
        }).catch(() => {});
      }
    }

    aggregate.clientsSynced++;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Cron] ========== COMPLETED in ${durationSec}s ==========`);
  console.log(`[Cron] Synced ${aggregate.clientsSynced}/${sortedClients.length} clients | Meta: ${aggregate.metaInsights} | Google: ${aggregate.googleRows} | TikTok: ${aggregate.tiktokRows} | Errors: ${aggregate.errors.length}`);

  return NextResponse.json({ ...aggregate, totalClients: sortedClients.length, durationSec });
}
