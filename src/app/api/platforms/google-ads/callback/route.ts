import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { listAccessibleCustomers, getCustomerInfo } from "@/lib/api/google-ads/client";

/**
 * OAuth callback — מקבל code, ממיר ל-token, שומר חיבור + חשבונות נגישים
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const origin = new URL(req.url).origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/clients?google_ads_error=${error ?? "missing_params"}`);
  }

  let decoded: { clientId: string; userId: string };
  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  } catch {
    return NextResponse.redirect(`${origin}/clients?google_ads_error=invalid_state`);
  }

  const { clientId } = decoded;
  const isProd = process.env.NODE_ENV === "production";
  const redirectUri = isProd
    ? "https://agency.mr-digitailor.co.il/api/platforms/google-ads/callback"
    : `${origin}/api/platforms/google-ads/callback`;

  try {
    // 1. Exchange code for token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description ?? "No access token");
    }

    console.log("[GoogleAds Callback] Got token, refreshToken:", !!tokenData.refresh_token);

    // 2. Get user email
    let email = "";
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoRes.json();
      email = userInfo.email ?? "";
    } catch {}

    // 3. Save connection
    const conn = await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "google_ads" } },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? "",
        tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        accountEmail: email,
        isActive: true,
      },
      create: {
        clientId,
        platform: "google_ads",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? "",
        tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        accountEmail: email,
      },
    });

    // 4. Fetch accessible customer accounts
    try {
      const customerIds = await listAccessibleCustomers({ accessToken: tokenData.access_token });
      console.log(`[GoogleAds Callback] Found ${customerIds.length} accessible customers`);

      for (const custId of customerIds) {
        try {
          const info = await getCustomerInfo(custId, { accessToken: tokenData.access_token });
          await prisma.platformAsset.upsert({
            where: {
              connectionId_assetType_externalId: {
                connectionId: conn.id,
                assetType: "google_ads_account",
                externalId: custId,
              },
            },
            update: { name: info.name, extraData: JSON.stringify({ currency: info.currencyCode, timeZone: info.timeZone }) },
            create: {
              connectionId: conn.id,
              assetType: "google_ads_account",
              externalId: custId,
              name: info.name,
              extraData: JSON.stringify({ currency: info.currencyCode, timeZone: info.timeZone }),
            },
          });
        } catch (err) {
          console.warn(`[GoogleAds Callback] Could not get customer ${custId}:`, err);
          // Still save the ID even if we can't get details
          await prisma.platformAsset.upsert({
            where: {
              connectionId_assetType_externalId: {
                connectionId: conn.id,
                assetType: "google_ads_account",
                externalId: custId,
              },
            },
            update: {},
            create: {
              connectionId: conn.id,
              assetType: "google_ads_account",
              externalId: custId,
              name: custId,
            },
          });
        }
      }
    } catch (err) {
      console.error("[GoogleAds Callback] Could not list customers:", err);
    }

    return NextResponse.redirect(`${origin}/clients/${clientId}?google_ads_connected=1`);
  } catch (err) {
    console.error("[GoogleAds Callback]", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(`${origin}/clients/${clientId}?google_ads_error=${encodeURIComponent(msg)}`);
  }
}
