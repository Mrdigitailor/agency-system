import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { refreshGoogleToken } from "@/lib/api/google-ads/client";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const log: string[] = [];
  const out = (msg: string) => { console.log(`[DEBUG GAds] ${msg}`); log.push(msg); };

  out(`========== Debug Google Ads for client ${clientId} ==========`);

  // 1. Connection
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "google_ads", isActive: true },
    include: { assets: true },
  });

  if (!connection) {
    out("❌ אין חיבור Google Ads פעיל");
    return NextResponse.json({ log, error: "no_connection" });
  }

  out(`✅ חיבור נמצא: id=${connection.id}`);
  out(`   accountEmail: ${connection.accountEmail || "(empty)"}`);
  out(`   accessToken: ${connection.accessToken.slice(0, 20)}... (len=${connection.accessToken.length})`);
  out(`   refreshToken: ${connection.refreshToken ? connection.refreshToken.slice(0, 15) + "..." : "❌ MISSING"}`);
  out(`   tokenExpiry: ${connection.tokenExpiry?.toISOString() ?? "null"}`);
  out(`   isExpired: ${connection.tokenExpiry ? connection.tokenExpiry < new Date() : "unknown"}`);
  out(`   assets count: ${connection.assets.length}`);
  for (const a of connection.assets) {
    out(`     ${a.assetType} | ${a.externalId} | ${a.name} | selected=${a.isSelected}`);
  }

  // 2. ENV check
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
  out(`\n📦 GOOGLE_ADS_DEVELOPER_TOKEN: ${devToken ? devToken.slice(0, 8) + "... (len=" + devToken.length + ")" : "❌ NOT SET"}`);
  out(`   GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? "✅ set" : "❌ NOT SET"}`);
  out(`   GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? "✅ set" : "❌ NOT SET"}`);

  // 3. Token refresh
  let token = connection.accessToken;
  const isExpired = connection.tokenExpiry && connection.tokenExpiry < new Date();

  if (isExpired || !connection.tokenExpiry) {
    out(`\n🔄 Token expired or no expiry — attempting refresh...`);
    if (!connection.refreshToken) {
      out(`❌ No refresh token! User must reconnect with prompt=consent`);
    } else {
      try {
        const refreshed = await refreshGoogleToken(connection.refreshToken);
        if (refreshed) {
          token = refreshed.access_token;
          out(`✅ Token refreshed successfully: ${token.slice(0, 20)}... expires_in=${refreshed.expires_in}s`);
          await prisma.platformConnection.update({
            where: { id: connection.id },
            data: { accessToken: token, tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000) },
          });
          out(`   Saved new token to DB`);
        } else {
          out(`❌ Token refresh returned null`);
        }
      } catch (err) {
        out(`❌ Token refresh failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  } else {
    out(`\n✅ Token not expired (expires ${connection.tokenExpiry.toISOString()})`);
  }

  // 4. Call ListAccessibleCustomers
  out(`\n📡 Calling ListAccessibleCustomers...`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": devToken,
  };
  out(`   Headers: Authorization=Bearer ${token.slice(0, 15)}..., developer-token=${devToken.slice(0, 8)}...`);

  try {
    const url = `${GOOGLE_ADS_API}/customers:listAccessibleCustomers`;
    out(`   URL: ${url}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);

    out(`   HTTP status: ${res.status} ${res.statusText}`);

    const text = await res.text();
    out(`   Response body: ${text.slice(0, 500)}`);

    if (res.ok) {
      const data = JSON.parse(text);
      const customerIds = (data.resourceNames ?? []).map((r: string) => r.replace("customers/", ""));
      out(`\n✅ Found ${customerIds.length} accessible customers:`);

      // Try to get details for each
      for (const custId of customerIds.slice(0, 10)) {
        try {
          const custRes = await fetch(`${GOOGLE_ADS_API}/customers/${custId}`, { headers });
          if (custRes.ok) {
            const custData = await custRes.json();
            out(`   ${custId} — ${custData.descriptiveName ?? "(no name)"} | ${custData.currencyCode ?? "?"} | manager=${custData.manager ?? false}`);
          } else {
            const custErr = await custRes.text();
            out(`   ${custId} — ❌ ${custRes.status}: ${custErr.slice(0, 150)}`);
          }
        } catch (err) {
          out(`   ${custId} — ❌ ${err instanceof Error ? err.message : err}`);
        }
      }

      return NextResponse.json({ log, customerIds, count: customerIds.length });
    } else {
      out(`\n❌ API returned error ${res.status}`);

      // Parse error details
      try {
        const errData = JSON.parse(text);
        if (errData.error) {
          out(`   code: ${errData.error.code}`);
          out(`   message: ${errData.error.message}`);
          out(`   status: ${errData.error.status}`);
          if (errData.error.details) {
            for (const d of errData.error.details) {
              out(`   detail: ${JSON.stringify(d).slice(0, 200)}`);
            }
          }
        }
      } catch {}

      return NextResponse.json({ log, error: `HTTP ${res.status}`, responseBody: text.slice(0, 1000) });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`❌ Request failed: ${msg}`);
    return NextResponse.json({ log, error: msg });
  }
}
