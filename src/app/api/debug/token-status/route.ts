import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/debug/token-status
 * סטטוס כל ה-tokens של Meta connections
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const log: string[] = [];
  const out = (msg: string) => { console.log(`[Token Status] ${msg}`); log.push(msg); };

  const connections = await prisma.platformConnection.findMany({
    where: { platform: "meta", isActive: true },
    select: { id: true, clientId: true, accessToken: true, tokenExpiry: true, accountName: true, lastSyncAt: true },
  });

  out(`========== Meta Token Status (${connections.length} connections) ==========`);

  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";
  const results: Array<{
    clientId: string;
    accountName: string;
    tokenLength: number;
    tokenExpiry: string | null;
    daysLeft: number | null;
    isExpired: boolean;
    debugTokenValid: boolean | null;
    debugTokenType: string | null;
    debugTokenExpiresAt: string | null;
    lastSync: string | null;
  }> = [];

  for (const conn of connections) {
    const client = await prisma.client.findUnique({ where: { id: conn.clientId }, select: { name: true } });
    const daysLeft = conn.tokenExpiry ? Math.round((conn.tokenExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    const isExpired = conn.tokenExpiry ? conn.tokenExpiry < new Date() : false;

    out(`\n${client?.name ?? conn.clientId}:`);
    out(`  token: ${conn.accessToken.slice(0, 15)}... (len=${conn.accessToken.length})`);
    out(`  expiry: ${conn.tokenExpiry?.toISOString() ?? "null"} (${daysLeft ?? "?"} days left)`);
    out(`  expired: ${isExpired}`);
    out(`  lastSync: ${conn.lastSyncAt?.toISOString() ?? "never"}`);

    // Debug token via Meta API
    let debugValid: boolean | null = null;
    let debugType: string | null = null;
    let debugExpires: string | null = null;

    try {
      const res = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${conn.accessToken}&access_token=${appId}|${appSecret}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const json = await res.json();
        const d = json.data;
        debugValid = d?.is_valid ?? null;
        debugType = d?.type ?? null;
        const expiresAt = d?.expires_at ? new Date(d.expires_at * 1000) : null;
        debugExpires = expiresAt?.toISOString() ?? null;
        out(`  Meta debug_token: valid=${d?.is_valid}, type=${d?.type}, expires=${debugExpires}`);
        if (d?.error) out(`  Meta debug error: ${JSON.stringify(d.error).slice(0, 200)}`);
      } else {
        out(`  Meta debug_token: HTTP ${res.status}`);
      }
    } catch (err) {
      out(`  Meta debug_token: failed — ${err instanceof Error ? err.message : err}`);
    }

    results.push({
      clientId: conn.clientId,
      accountName: `${client?.name ?? ""} (${conn.accountName ?? ""})`,
      tokenLength: conn.accessToken.length,
      tokenExpiry: conn.tokenExpiry?.toISOString() ?? null,
      daysLeft,
      isExpired,
      debugTokenValid: debugValid,
      debugTokenType: debugType,
      debugTokenExpiresAt: debugExpires,
      lastSync: conn.lastSyncAt?.toISOString() ?? null,
    });
  }

  // Summary
  const expired = results.filter((r) => r.isExpired).length;
  const shortLived = results.filter((r) => r.tokenLength < 100).length;
  const invalid = results.filter((r) => r.debugTokenValid === false).length;

  out(`\n========== Summary ==========`);
  out(`Total: ${results.length} | Expired: ${expired} | Invalid: ${invalid} | Short tokens (<100 chars): ${shortLived}`);

  return NextResponse.json({ log, results, summary: { total: results.length, expired, invalid, shortLived } });
}
