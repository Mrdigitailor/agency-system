import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decodeState, exchangeCodeForToken, exchangeForLongLivedToken, getMeInfo } from "@/lib/api/meta/oauth";
import { metaApiGet } from "@/lib/api/meta/client";

// עדכון token לכל הלקוחות (mode=all) עשוי לכלול הרבה עמודים — נותנים לו זמן
export const maxDuration = 60;

/**
 * OAuth callback — שלב 1: שומר רק token, בלי לשאוב נכסים
 * הנכסים יישאבו ב-lazy loading כשלוחצים "ניהול נכסים"
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const origin = new URL(req.url).origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/clients?meta_error=${error ?? "missing_params"}`);
  }

  const decoded = decodeState(state);
  if (!decoded || (decoded.mode !== "all" && !decoded.clientId)) {
    return NextResponse.redirect(`${origin}/clients?meta_error=invalid_state`);
  }
  const { clientId } = decoded;
  const reconnectAll = decoded.mode === "all";

  try {
    // 1. החלפת code ל-token
    const shortToken = await exchangeCodeForToken(code, origin);
    if (!shortToken?.access_token) throw new Error("לא התקבל access token");

    // 2. המרה ל-long-lived (60 יום)
    console.log(`[Meta Callback] Short token received: ${shortToken.access_token.slice(0, 15)}... (len=${shortToken.access_token.length})`);
    console.log("[Meta Callback] Exchanging for long-lived token...");
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);

    let accessToken: string;
    let tokenExpiry: Date;

    if (longToken?.access_token) {
      accessToken = longToken.access_token;
      const expiresIn = longToken.expires_in ?? 5184000; // 60 days default
      tokenExpiry = new Date(Date.now() + expiresIn * 1000);
      console.log(`[Meta Callback] ✅ LONG-LIVED token: ${accessToken.slice(0, 15)}... expires: ${tokenExpiry.toISOString()} (${Math.round(expiresIn / 86400)} days)`);
    } else {
      // Fallback to short-lived — set expiry to 1 hour (not 60 days!)
      accessToken = shortToken.access_token;
      tokenExpiry = new Date(Date.now() + 3600 * 1000);
      console.error(`[Meta Callback] ⚠️ WARNING: Using SHORT-LIVED token! Expires in 1 hour. Long-lived exchange failed.`);
    }

    // 3. פרטי המשתמש
    const meInfo = await getMeInfo(accessToken);

    // page tokens חדשים מ-/me/accounts (משמש גם ליחיד וגם ל"כל הלקוחות")
    let pages: Array<{ id: string; name: string; access_token: string }> = [];
    try {
      const me = await metaApiGet<{ data: Array<{ id: string; name: string; access_token: string }> }>(
        "/me/accounts",
        { accessToken, params: { fields: "id,name,access_token" } }
      );
      pages = me.data ?? [];
      console.log(`[Meta Callback] Got ${pages.length} pages from /me/accounts`);
    } catch (e) {
      console.warn(`[Meta Callback] Could not fetch /me/accounts page tokens:`, e);
    }
    const pageById = new Map(pages.map((p) => [p.id, p]));

    // ========= מצב "כל הלקוחות": התחברות אחת → token חדש לכל חיבורי ה-Meta =========
    if (reconnectAll) {
      const connections = await prisma.platformConnection.findMany({
        where: { platform: "meta" },
        include: { assets: { where: { assetType: "facebook_page" } } },
      });
      let updated = 0;
      for (const c of connections) {
        // עדכון ה-token בלבד — בחירת הנכסים (isSelected) נשמרת כמות שהיא
        await prisma.platformConnection.update({
          where: { id: c.id },
          data: { accessToken, tokenExpiry, isActive: true, accountName: meInfo?.name ?? c.accountName, accountEmail: meInfo?.email ?? c.accountEmail },
        });
        // רענון page tokens לעמודים שקיימים אצל הלקוח הזה (במקביל)
        await Promise.all(
          c.assets
            .filter((pa) => pageById.has(pa.externalId))
            .map((pa) => prisma.platformAsset.update({
              where: { id: pa.id },
              data: { extraData: JSON.stringify({ pageAccessToken: pageById.get(pa.externalId)!.access_token }) },
            })),
        );
        updated++;
      }
      console.log(`[Meta Callback] reconnect-all: updated ${updated} connections`);
      return NextResponse.redirect(`${origin}/settings?meta_reconnected=${updated}`);
    }

    // 4. שמירה — token + פרטי משתמש
    const conn = await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "meta" } },
      update: { accessToken, tokenExpiry, accountName: meInfo?.name ?? "", accountEmail: meInfo?.email ?? "", isActive: true },
      create: { clientId, platform: "meta", accessToken, tokenExpiry, accountName: meInfo?.name ?? "", accountEmail: meInfo?.email ?? "" },
    });

    // 5. שמירת page tokens (מ-/me/accounts שנשלף למעלה) ב-extraData של כל page asset
    for (const page of pages) {
      await prisma.platformAsset.upsert({
        where: { connectionId_assetType_externalId: { connectionId: conn.id, assetType: "facebook_page", externalId: page.id } },
        update: { name: page.name, extraData: JSON.stringify({ pageAccessToken: page.access_token }) },
        create: { connectionId: conn.id, assetType: "facebook_page", externalId: page.id, name: page.name, extraData: JSON.stringify({ pageAccessToken: page.access_token }) },
      });
    }
    console.log(`[Meta Callback] Saved page tokens for ${pages.length} pages`);

    return NextResponse.redirect(`${origin}/clients/${clientId}?meta_connected=1`);
  } catch (err) {
    console.error("[Meta Callback]", err);
    const msg = err instanceof Error ? err.message : "unknown";
    const dest = reconnectAll ? `${origin}/settings` : `${origin}/clients/${clientId}`;
    return NextResponse.redirect(`${dest}?meta_error=${encodeURIComponent(msg)}`);
  }
}
