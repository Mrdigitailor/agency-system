import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { metaApiGetAll } from "@/lib/api/meta/client";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const log: string[] = [];
  const out = (msg: string) => { console.log(`[DEBUG Creative] ${msg}`); log.push(msg); };

  out(`========== Debug Creatives for client ${clientId} ==========`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: true },
  });

  if (!connection) {
    out("❌ אין חיבור Meta פעיל");
    return NextResponse.json({ log, error: "no_connection" });
  }

  out(`✅ חיבור: ${connection.accountName} | token: ${connection.accessToken.slice(0, 15)}... | expires: ${connection.tokenExpiry?.toISOString() ?? "null"}`);
  out(`   isExpired: ${connection.tokenExpiry ? connection.tokenExpiry < new Date() : "unknown"}`);

  const adAccounts = connection.assets.filter((a) => a.assetType === "ad_account");
  out(`\n📊 Ad accounts: ${adAccounts.length}`);
  for (const a of adAccounts) {
    out(`   ${a.externalId} | ${a.name} | selected=${a.isSelected}`);
  }

  const selectedAd = adAccounts.find((a) => a.isSelected);
  if (!selectedAd) {
    out("❌ אין חשבון מודעות נבחר (isSelected=true)");
    return NextResponse.json({ log, error: "no_selected_ad_account" });
  }

  out(`\n✅ Ad account: ${selectedAd.externalId} (${selectedAd.name})`);

  // Check DB cache
  const dbCount = await prisma.metaCreative.count({ where: { clientId } });
  out(`\n💾 MetaCreative records in DB: ${dbCount}`);

  // Call Meta API
  const apiUrl = `/${selectedAd.externalId}/ads`;
  out(`\n📡 Calling: ${apiUrl}?fields=id,name,status,effective_status,creative{id,name,title,body,thumbnail_url,image_url,object_story_spec}&filtering=[effective_status IN ACTIVE,PAUSED,...]&limit=10`);

  try {
    const ads = await metaApiGetAll<{
      id: string;
      name: string;
      status: string;
      effective_status: string;
      creative?: {
        id?: string;
        name?: string;
        title?: string;
        body?: string;
        thumbnail_url?: string;
        image_url?: string;
        object_story_spec?: Record<string, unknown>;
      };
    }>(apiUrl, {
      accessToken: connection.accessToken,
      params: {
        fields: "id,name,status,effective_status,creative{id,name,title,body,thumbnail_url,image_url,object_story_spec}",
        filtering: JSON.stringify([{
          field: "effective_status",
          operator: "IN",
          value: ["ACTIVE", "PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"],
        }]),
        limit: "10",
      },
    });

    out(`\n✅ Got ${ads.length} ads from API`);

    for (const ad of ads.slice(0, 5)) {
      const cr = ad.creative;
      out(`   📢 ${ad.id} | "${ad.name}" | status=${ad.effective_status}`);
      out(`      creative: ${cr ? `id=${cr.id}, title="${cr.title ?? ""}", body="${(cr.body ?? "").slice(0, 50)}", thumb=${cr.thumbnail_url ? "yes" : "no"}, img=${cr.image_url ? "yes" : "no"}` : "❌ NO CREATIVE"}`);
    }

    const withCreative = ads.filter((a) => a.creative).length;
    const withoutCreative = ads.filter((a) => !a.creative).length;
    out(`\n📊 With creative: ${withCreative} | Without: ${withoutCreative}`);

    return NextResponse.json({
      log,
      adAccountId: selectedAd.externalId,
      adsFromApi: ads.length,
      withCreative,
      withoutCreative,
      dbCachedCount: dbCount,
      sampleAds: ads.slice(0, 3).map((a) => ({
        id: a.id,
        name: a.name,
        status: a.effective_status,
        hasCreative: !!a.creative,
        creativeId: a.creative?.id,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`\n❌ API Error: ${msg}`);

    if (msg.includes("META_TOKEN_EXPIRED") || msg.includes("code: 190")) {
      out("⚠️ Token expired — user needs to reconnect Meta");
    }

    return NextResponse.json({ log, error: msg, dbCachedCount: dbCount });
  }
}
