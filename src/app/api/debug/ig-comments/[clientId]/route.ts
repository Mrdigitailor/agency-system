import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { metaApiGet, metaApiGetAll } from "@/lib/api/meta/client";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const log: string[] = [];
  const out = (msg: string) => { console.log(`[DEBUG IG] ${msg}`); log.push(msg); };

  out(`========== Debug IG Comments for client ${clientId} ==========`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: true },
  });

  if (!connection) {
    out("❌ אין חיבור Meta פעיל");
    return NextResponse.json({ log, error: "no_connection" });
  }

  out(`✅ חיבור: ${connection.accountName} | token: ${connection.accessToken.slice(0, 15)}...`);

  // Find IG asset
  const igAssets = connection.assets.filter((a) => a.assetType === "instagram");
  out(`\n📷 Instagram assets found: ${igAssets.length}`);
  for (const a of igAssets) {
    out(`   ${a.externalId} | ${a.name} | selected=${a.isSelected} | extraData keys: ${Object.keys(JSON.parse(a.extraData || "{}")).join(",") || "empty"}`);
  }

  const igAsset = igAssets.find((a) => a.isSelected);
  if (!igAsset) {
    out("❌ אין Instagram account נבחר (isSelected=true)");
    return NextResponse.json({ log, error: "no_selected_ig" });
  }

  out(`\n✅ IG Account: ${igAsset.name} (${igAsset.externalId})`);

  // Find page asset for page token
  const pageAssets = connection.assets.filter((a) => a.assetType === "facebook_page");
  out(`\n📄 Facebook pages: ${pageAssets.length}`);
  for (const p of pageAssets) {
    const extra = JSON.parse(p.extraData || "{}");
    out(`   ${p.externalId} | ${p.name} | selected=${p.isSelected} | hasPageToken=${!!extra.pageAccessToken} | igAccountId=${extra.instagramAccountId ?? "none"}`);
  }

  // Determine token to use
  const selectedPage = pageAssets.find((p) => p.isSelected);
  let token = connection.accessToken;
  let tokenSource = "user token (fallback)";

  if (selectedPage) {
    const pageExtra = JSON.parse(selectedPage.extraData || "{}");
    if (pageExtra.pageAccessToken) {
      token = pageExtra.pageAccessToken;
      tokenSource = `page token from ${selectedPage.name}`;
    }
  }

  out(`\n🔑 Using token: ${tokenSource} | ${token.slice(0, 15)}...`);

  // Try fetching media with comments
  out(`\n📡 Fetching /${igAsset.externalId}/media?fields=id,caption,timestamp,media_type,comments_count,like_count,comments{id,text,from,timestamp,like_count,replies{id,text,from,timestamp}}`);

  try {
    const media = await metaApiGetAll<{
      id: string;
      caption?: string;
      timestamp?: string;
      media_type?: string;
      comments_count?: number;
      like_count?: number;
      comments?: { data: Array<{ id: string; text: string; from?: { username: string; id: string }; timestamp: string; like_count?: number; replies?: { data: Array<{ id: string; text: string; from?: { username: string }; timestamp: string }> } }> };
    }>(`/${igAsset.externalId}/media`, {
      accessToken: token,
      params: {
        fields: "id,caption,timestamp,media_type,comments_count,like_count,comments{id,text,from,timestamp,like_count,replies{id,text,from,timestamp}}",
        limit: "25",
      },
    });

    out(`\n✅ Got ${media.length} media items`);

    let totalComments = 0;
    for (const m of media.slice(0, 10)) {
      const cc = m.comments?.data?.length ?? 0;
      totalComments += cc;
      out(`   📸 ${m.id} | ${m.media_type ?? "?"} | comments=${cc} | likes=${m.like_count ?? 0} | ${m.caption?.slice(0, 50) ?? "(no caption)"}`);
      if (cc > 0 && m.comments?.data) {
        for (const c of m.comments.data.slice(0, 3)) {
          out(`      💬 @${c.from?.username ?? "?"}: "${c.text?.slice(0, 60)}" (${c.like_count ?? 0} ❤)`);
          if (c.replies?.data?.length) {
            out(`         ↪ ${c.replies.data.length} replies`);
          }
        }
      }
    }

    out(`\n📊 Total comments: ${totalComments} across ${media.length} media items`);

    // Also check what the sync cache has
    const cachedCount = await prisma.igCommentCache.count({ where: { clientId } });
    out(`\n💾 Cached IG comments in DB: ${cachedCount}`);

    return NextResponse.json({
      log,
      igAccountId: igAsset.externalId,
      tokenSource,
      mediaCount: media.length,
      totalComments,
      cachedCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`\n❌ API Error: ${msg}`);
    return NextResponse.json({ log, error: msg });
  }
}
