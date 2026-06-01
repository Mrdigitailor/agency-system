import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/debug/google-token-status
 * סטטוס כל ה-tokens של Google Ads connections — הזמן שנשאר עד תפוגה ואיזה token חסר.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const connections = await prisma.platformConnection.findMany({
    where: { platform: "google_ads" },
    include: { client: { select: { name: true, status: true, deletedAt: true } } },
  });

  const now = Date.now();
  const formatDuration = (ms: number) => {
    if (ms <= 0) return "פג";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} דק׳`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} שעות`;
    const days = Math.floor(hours / 24);
    return `${days} ימים`;
  };

  const rows = connections.map((c) => {
    const expiryMs = c.tokenExpiry ? new Date(c.tokenExpiry).getTime() : 0;
    const remainingMs = expiryMs - now;
    const isExpired = !expiryMs || remainingMs <= 0;
    const expiringSoon = !isExpired && remainingMs < 5 * 60 * 1000;

    let healthStatus: "ok" | "expiring_soon" | "expired" | "no_refresh_token";
    if (!c.refreshToken) healthStatus = "no_refresh_token";
    else if (isExpired) healthStatus = "expired";
    else if (expiringSoon) healthStatus = "expiring_soon";
    else healthStatus = "ok";

    return {
      connectionId: c.id,
      clientId: c.clientId,
      clientName: c.client?.name ?? "(unknown)",
      clientStatus: c.client?.status ?? null,
      clientDeleted: !!c.client?.deletedAt,
      isActive: c.isActive,
      accountEmail: c.accountEmail || null,
      accountName: c.accountName || null,
      hasAccessToken: !!c.accessToken,
      accessTokenLength: c.accessToken?.length ?? 0,
      hasRefreshToken: !!c.refreshToken,
      refreshTokenLength: c.refreshToken?.length ?? 0,
      tokenExpiry: c.tokenExpiry?.toISOString() ?? null,
      isExpired,
      expiringSoon,
      remainingHuman: c.tokenExpiry ? formatDuration(remainingMs) : "—",
      remainingMs,
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      healthStatus,
    };
  });

  const summary = {
    total: rows.length,
    ok: rows.filter((r) => r.healthStatus === "ok").length,
    expiringSoon: rows.filter((r) => r.healthStatus === "expiring_soon").length,
    expired: rows.filter((r) => r.healthStatus === "expired").length,
    missingRefreshToken: rows.filter((r) => r.healthStatus === "no_refresh_token").length,
  };

  console.log(`[GoogleTokenStatus] ${JSON.stringify(summary)}`);
  for (const r of rows) {
    console.log(
      `[GoogleTokenStatus] ${r.clientName} | refresh=${r.hasRefreshToken ? "yes" : "NO"} | expiry=${r.tokenExpiry ?? "null"} | ${r.healthStatus} | left=${r.remainingHuman}`
    );
  }

  return NextResponse.json({ summary, connections: rows });
}
