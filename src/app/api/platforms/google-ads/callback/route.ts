import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  listAccessibleCustomers,
  getCustomerInfo,
  listMccChildAccounts,
} from "@/lib/api/google-ads/client";

/**
 * OAuth callback — מקבל code, ממיר ל-token, שולף חשבונות (כולל תחת MCC)
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

    // 2. Get user email
    let email = "";
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoRes.json();
      email = userInfo.email ?? "";
    } catch {}

    // 3. List accessible customers (top-level — usually MCC accounts)
    const topLevelIds = await listAccessibleCustomers({ accessToken: tokenData.access_token });
    console.log(`[GoogleAds Callback] Top-level accounts: ${topLevelIds.join(", ")}`);

    // 4. For each top-level, try listing child accounts (MCC), then fall back to direct info
    const allAccounts: Array<{ id: string; name: string; currency: string; mccId: string }> = [];

    for (const custId of topLevelIds) {
      // נסה קודם לשאוב children (עובד ל-MCC, נכשל לחשבון רגיל)
      try {
        const children = await listMccChildAccounts(custId, { accessToken: tokenData.access_token });
        const nonManagerChildren = children.filter((c) => !c.isManager);

        if (nonManagerChildren.length > 0) {
          console.log(`[GoogleAds Callback] ${custId} is MCC with ${nonManagerChildren.length} child accounts`);
          for (const child of nonManagerChildren) {
            allAccounts.push({
              id: child.id,
              name: child.name,
              currency: child.currencyCode,
              mccId: custId,
            });
          }
          continue; // MCC processed — skip to next
        }
      } catch (err) {
        console.log(`[GoogleAds Callback] ${custId} is not MCC: ${(err as Error).message?.slice(0, 80)}`);
      }

      // לא MCC — נסה לקבל פרטי חשבון רגיל
      try {
        const info = await getCustomerInfo(custId, { accessToken: tokenData.access_token });
        allAccounts.push({ id: custId, name: info.name, currency: info.currencyCode, mccId: "" });
      } catch (err) {
        // גם getCustomerInfo נכשל (MCC שלא מחזיר children?) — שמור עם ID בלבד
        console.warn(`[GoogleAds Callback] Could not get info for ${custId}: ${(err as Error).message?.slice(0, 80)}`);
        allAccounts.push({ id: custId, name: custId, currency: "ILS", mccId: "" });
      }
    }

    console.log(`[GoogleAds Callback] Total accounts to save: ${allAccounts.length}`);

    // 5. Determine primary MCC ID (the first MCC found, if any)
    const primaryMccId = allAccounts.find((a) => a.mccId)?.mccId ?? "";

    // 6. Save connection with MCC ID in accountName
    // חשוב: Google מחזיר refresh_token רק כשהמשתמש אישר (prompt=consent / access_type=offline).
    // אם הוא לא נשלח (re-consent ללא prompt) — אסור לדרוס את הקיים ב-DB.
    const updatePayload: Record<string, unknown> = {
      accessToken: tokenData.access_token,
      tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
      accountName: primaryMccId ? `MCC: ${primaryMccId}` : "",
      accountEmail: email,
      isActive: true,
    };
    if (tokenData.refresh_token) {
      updatePayload.refreshToken = tokenData.refresh_token;
    } else {
      console.warn(`[GoogleAds Callback] No refresh_token in response — keeping existing one for client ${clientId}`);
    }

    const conn = await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "google_ads" } },
      update: updatePayload,
      create: {
        clientId,
        platform: "google_ads",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? "",
        tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        accountName: primaryMccId ? `MCC: ${primaryMccId}` : "",
        accountEmail: email,
      },
    });

    // 7. Save accounts as assets (only non-MCC accounts)
    for (const acc of allAccounts) {
      await prisma.platformAsset.upsert({
        where: {
          connectionId_assetType_externalId: {
            connectionId: conn.id,
            assetType: "google_ads_account",
            externalId: acc.id,
          },
        },
        update: {
          name: acc.name,
          extraData: JSON.stringify({ currency: acc.currency, mccId: acc.mccId }),
        },
        create: {
          connectionId: conn.id,
          assetType: "google_ads_account",
          externalId: acc.id,
          name: acc.name,
          extraData: JSON.stringify({ currency: acc.currency, mccId: acc.mccId }),
        },
      });
    }

    console.log(`[GoogleAds Callback] Saved ${allAccounts.length} accounts for client ${clientId}`);

    return NextResponse.redirect(`${origin}/clients/${clientId}?google_ads_connected=1`);
  } catch (err) {
    console.error("[GoogleAds Callback]", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(`${origin}/clients/${clientId}?google_ads_error=${encodeURIComponent(msg)}`);
  }
}
