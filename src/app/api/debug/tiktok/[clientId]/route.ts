import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const log: string[] = [];
  const out = (msg: string) => { console.log(`[DEBUG TikTok] ${msg}`); log.push(msg); };

  out(`========== Debug TikTok for client ${clientId} ==========`);

  // ENV
  const appId = process.env.TIKTOK_APP_ID ?? "";
  const appSecret = process.env.TIKTOK_APP_SECRET ?? "";
  out(`TIKTOK_APP_ID: ${appId ? `${appId.slice(0, 8)}... (len=${appId.length})` : "❌ NOT SET"}`);
  out(`TIKTOK_APP_SECRET: ${appSecret ? `${appSecret.slice(0, 8)}... (len=${appSecret.length})` : "❌ NOT SET"}`);

  // Connection
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "tiktok", isActive: true },
    include: { assets: true },
  });

  if (!connection) {
    out("❌ אין חיבור TikTok פעיל");
    return NextResponse.json({ log, error: "no_connection" });
  }

  out(`✅ חיבור: token=${connection.accessToken.slice(0, 15)}... (len=${connection.accessToken.length})`);
  out(`   assets: ${connection.assets.length}`);
  for (const a of connection.assets) {
    out(`   ${a.assetType} | ${a.externalId} | ${a.name} | selected=${a.isSelected}`);
  }

  // Call TikTok API
  out(`\n📡 Calling /oauth2/advertiser/get/...`);
  const url = `https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=${appId}&secret=${appSecret}&access_token=${connection.accessToken}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    out(`HTTP status: ${res.status}`);
    const text = await res.text();
    out(`Response: ${text.slice(0, 500)}`);

    if (res.ok) {
      const json = JSON.parse(text);
      out(`code: ${json.code}, message: ${json.message}`);
      if (json.data?.list) {
        out(`✅ Found ${json.data.list.length} advertisers:`);
        for (const adv of json.data.list) {
          out(`   ${adv.advertiser_id} — ${adv.advertiser_name}`);
        }
      }
      return NextResponse.json({ log, advertisers: json.data?.list ?? [] });
    } else {
      out(`❌ API error`);
      return NextResponse.json({ log, error: `HTTP ${res.status}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`❌ Request failed: ${msg}`);
    return NextResponse.json({ log, error: msg });
  }
}
