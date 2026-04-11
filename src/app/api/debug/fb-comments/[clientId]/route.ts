import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { metaApiGet, metaApiGetAll } from "@/lib/api/meta/client";
import { fetchPageAccessToken } from "@/lib/api/meta/messages";

/**
 * Debug endpoint — מאבחן בעיית "תגובות פייסבוק לא מוצגות".
 *
 * מציג שלב-שלב:
 *  1. האם יש חיבור Meta?
 *  2. האם נבחר עמוד פייסבוק?
 *  3. האם יש page access token שמור? אם לא — מנסה לשלוף.
 *  4. קורא ל-/{pageId}/feed ומדפיס את ה-response המלא.
 *  5. מסכם פוסטים + תגובות.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const log: string[] = [];
  const out = (msg: string) => {
    console.log(`[DEBUG FB] ${msg}`);
    log.push(msg);
  };

  out(`========== Debug FB Comments for client ${clientId} ==========`);

  // 1. חיבור
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: true },
  });

  if (!connection) {
    out(`❌ אין חיבור Meta פעיל`);
    return NextResponse.json({ log, error: "no_connection" });
  }
  out(`✅ חיבור Meta נמצא: ${connection.accountName} (id=${connection.id})`);
  out(`   accessToken: ${connection.accessToken.slice(0, 20)}... (length=${connection.accessToken.length})`);
  out(`   tokenExpiry: ${connection.tokenExpiry?.toISOString() ?? "null"}`);

  // 2. עמוד פייסבוק
  const pageAssets = connection.assets.filter((a) => a.assetType === "facebook_page");
  out(`📄 עמודי פייסבוק נמצאו: ${pageAssets.length}`);
  for (const p of pageAssets) {
    out(`   - ${p.name} (id=${p.externalId}, isSelected=${p.isSelected})`);
  }

  const selectedPage = connection.assets.find((a) => a.assetType === "facebook_page" && a.isSelected);
  if (!selectedPage) {
    out(`❌ אין עמוד פייסבוק נבחר (isSelected=true)`);
    return NextResponse.json({ log, error: "no_selected_page" });
  }
  out(`✅ עמוד נבחר: ${selectedPage.name} (id=${selectedPage.externalId})`);

  // 3. page access token
  const extra = JSON.parse(selectedPage.extraData ?? "{}");
  out(`📦 extraData keys: ${Object.keys(extra).join(", ") || "(empty)"}`);

  let pageToken = extra.pageAccessToken as string | undefined;
  if (pageToken) {
    out(`✅ page token שמור: ${pageToken.slice(0, 20)}... (length=${pageToken.length})`);
  } else {
    out(`⚠️  אין page token שמור — מנסה לשלוף מ-/me/accounts...`);
    try {
      const me = await metaApiGet<{ data: Array<{ id: string; name: string; access_token: string }> }>(
        "/me/accounts",
        { accessToken: connection.accessToken, params: { fields: "id,name,access_token" } }
      );
      out(`   /me/accounts החזיר ${me.data?.length ?? 0} עמודים`);
      for (const p of me.data ?? []) {
        out(`     - ${p.name} (id=${p.id}) token=${p.access_token?.slice(0, 15)}...`);
      }
      const matching = me.data?.find((p) => p.id === selectedPage.externalId);
      if (matching?.access_token) {
        pageToken = matching.access_token;
        out(`✅ נמצא page token עבור ${selectedPage.externalId}: ${pageToken.slice(0, 20)}...`);
        // שמור
        await prisma.platformAsset.update({
          where: { id: selectedPage.id },
          data: { extraData: JSON.stringify({ ...extra, pageAccessToken: pageToken }) },
        });
        out(`   נשמר ב-DB`);
      } else {
        out(`❌ /me/accounts לא החזיר את העמוד הזה`);
        // נסיון אחרון — fetchPageAccessToken (קריאה ישירה)
        const direct = await fetchPageAccessToken(selectedPage.externalId, connection.accessToken);
        if (direct) {
          pageToken = direct;
          out(`✅ נמצא page token דרך GET /{page_id}: ${direct.slice(0, 20)}...`);
        } else {
          out(`❌ גם GET /{page_id}?fields=access_token נכשל`);
        }
      }
    } catch (err) {
      out(`❌ /me/accounts זרק שגיאה: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!pageToken) {
    out(`❌ אין page token. לא ניתן להמשיך.`);
    return NextResponse.json({ log, error: "no_page_token" });
  }

  // 4. קריאת ה-feed
  const feedUrl = `/${selectedPage.externalId}/feed?fields=id,message,permalink_url,created_time,comments{id,message,from,created_time,like_count,comment_count}`;
  out(`📡 קורא: ${feedUrl}`);
  out(`   token (in name of page): ${pageToken.slice(0, 20)}...`);

  try {
    const posts = await metaApiGetAll<{
      id: string;
      message?: string;
      permalink_url?: string;
      created_time?: string;
      comments?: { data: Array<{ id: string; message: string; from?: { name: string; id: string }; created_time: string; like_count?: number; comment_count?: number }> };
    }>(`/${selectedPage.externalId}/feed`, {
      accessToken: pageToken,
      params: {
        fields:
          "id,message,permalink_url,created_time,comments{id,message,from,created_time,like_count,comment_count}",
        limit: "25",
      },
    });

    out(`✅ קיבלנו ${posts.length} פוסטים`);

    let totalComments = 0;
    for (const p of posts) {
      const cc = p.comments?.data?.length ?? 0;
      totalComments += cc;
      out(`   📝 פוסט ${p.id}: ${cc} תגובות${p.message ? ` — "${p.message.slice(0, 60)}"` : ""}`);
      if (cc > 0 && p.comments?.data) {
        for (const c of p.comments.data.slice(0, 3)) {
          out(`      💬 ${c.from?.name ?? "?"}: "${c.message?.slice(0, 60) ?? ""}" (${c.like_count ?? 0} ❤)`);
        }
      }
    }
    out(`📊 סה״כ תגובות: ${totalComments}`);

    return NextResponse.json({
      log,
      summary: {
        connectionId: connection.id,
        pageId: selectedPage.externalId,
        pageName: selectedPage.name,
        hasPageToken: !!pageToken,
        postCount: posts.length,
        commentCount: totalComments,
      },
      posts: posts.slice(0, 5).map((p) => ({
        id: p.id,
        message: p.message?.slice(0, 100),
        commentCount: p.comments?.data?.length ?? 0,
        comments: p.comments?.data?.slice(0, 5),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`❌ שגיאה בקריאת feed: ${msg}`);
    return NextResponse.json({ log, error: msg });
  }
}
