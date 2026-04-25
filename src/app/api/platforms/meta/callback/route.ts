import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decodeState, exchangeCodeForToken, exchangeForLongLivedToken, getMeInfo } from "@/lib/api/meta/oauth";
import { metaApiGet } from "@/lib/api/meta/client";

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
  if (!decoded?.clientId) {
    return NextResponse.redirect(`${origin}/clients?meta_error=invalid_state`);
  }
  const { clientId } = decoded;

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

    // 4. שמירה — token + פרטי משתמש
    const conn = await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "meta" } },
      update: { accessToken, tokenExpiry, accountName: meInfo?.name ?? "", accountEmail: meInfo?.email ?? "", isActive: true },
      create: { clientId, platform: "meta", accessToken, tokenExpiry, accountName: meInfo?.name ?? "", accountEmail: meInfo?.email ?? "" },
    });

    // 5. שאיבת page tokens מ-/me/accounts ושמירה ב-extraData של כל page asset
    // (אם הנכסים עוד לא נוצרו — refresh-assets ישתמש בזה אח״כ)
    try {
      const me = await metaApiGet<{ data: Array<{ id: string; name: string; access_token: string }> }>(
        "/me/accounts",
        { accessToken, params: { fields: "id,name,access_token" } }
      );
      console.log(`[Meta Callback] Got ${me.data?.length ?? 0} pages from /me/accounts`);

      // upsert של כל page asset עם ה-page token
      for (const page of me.data ?? []) {
        await prisma.platformAsset.upsert({
          where: { connectionId_assetType_externalId: { connectionId: conn.id, assetType: "facebook_page", externalId: page.id } },
          update: { name: page.name, extraData: JSON.stringify({ pageAccessToken: page.access_token }) },
          create: { connectionId: conn.id, assetType: "facebook_page", externalId: page.id, name: page.name, extraData: JSON.stringify({ pageAccessToken: page.access_token }) },
        });
      }
      console.log(`[Meta Callback] Saved page tokens for ${me.data?.length ?? 0} pages`);
    } catch (e) {
      console.warn(`[Meta Callback] Could not fetch /me/accounts page tokens:`, e);
    }

    return NextResponse.redirect(`${origin}/clients/${clientId}?meta_connected=1`);
  } catch (err) {
    console.error("[Meta Callback]", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(`${origin}/clients/${clientId}?meta_error=${encodeURIComponent(msg)}`);
  }
}
