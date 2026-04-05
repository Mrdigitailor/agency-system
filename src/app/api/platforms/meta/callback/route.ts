import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decodeState, exchangeCodeForToken, exchangeForLongLivedToken, getMeInfo } from "@/lib/api/meta/oauth";
import { fetchAdAccounts, fetchPages, fetchInstagramAccounts } from "@/lib/api/meta/assets";

/**
 * OAuth callback מ-Meta
 * GET /api/platforms/meta/callback?code=...&state=...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const origin = new URL(req.url).origin;

  if (error) {
    console.error("[Meta Callback] OAuth error:", error, errorDescription);
    return NextResponse.redirect(`${origin}/clients?meta_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/clients?meta_error=missing_params`);
  }

  const decoded = decodeState(state);
  if (!decoded?.clientId) {
    return NextResponse.redirect(`${origin}/clients?meta_error=invalid_state`);
  }
  const { clientId } = decoded;

  try {
    // 1. החלפת code ל-short-lived token
    const shortToken = await exchangeCodeForToken(code);
    if (!shortToken?.access_token) {
      throw new Error("לא התקבל access token");
    }

    // 2. המרה ל-long-lived token (60 יום)
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);
    const accessToken = longToken?.access_token ?? shortToken.access_token;
    const expiresIn = longToken?.expires_in ?? shortToken.expires_in ?? 60 * 24 * 60 * 60;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    // 3. שליפת פרטי המשתמש
    const meInfo = await getMeInfo(accessToken);

    // 4. שמירת PlatformConnection
    const connection = await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "meta" } },
      update: {
        accessToken,
        tokenExpiry,
        accountName: meInfo?.name ?? "",
        accountEmail: meInfo?.email ?? "",
        isActive: true,
        lastSyncAt: new Date(),
      },
      create: {
        clientId,
        platform: "meta",
        accessToken,
        tokenExpiry,
        accountName: meInfo?.name ?? "",
        accountEmail: meInfo?.email ?? "",
        lastSyncAt: new Date(),
      },
    });

    // 5. שליפת נכסים זמינים
    const [adAccounts, pages] = await Promise.all([
      fetchAdAccounts(accessToken).catch(() => []),
      fetchPages(accessToken).catch(() => []),
    ]);

    const igAccounts = await fetchInstagramAccounts(pages, accessToken).catch(() => []);

    // 6. שמירת כל הנכסים כ-PlatformAsset
    for (const acc of adAccounts) {
      await prisma.platformAsset.upsert({
        where: {
          connectionId_assetType_externalId: {
            connectionId: connection.id,
            assetType: "ad_account",
            externalId: acc.id,
          },
        },
        update: { name: acc.name, extraData: JSON.stringify({ currency: acc.currency, status: acc.account_status }) },
        create: {
          connectionId: connection.id,
          assetType: "ad_account",
          externalId: acc.id,
          name: acc.name,
          extraData: JSON.stringify({ currency: acc.currency, status: acc.account_status }),
        },
      });
    }

    for (const page of pages) {
      await prisma.platformAsset.upsert({
        where: {
          connectionId_assetType_externalId: {
            connectionId: connection.id,
            assetType: "facebook_page",
            externalId: page.id,
          },
        },
        update: {
          name: page.name,
          extraData: JSON.stringify({
            category: page.category,
            followers: page.followers_count,
            pageAccessToken: page.access_token, // חיוני — נדרש לקריאות API של הדף
            instagramAccountId: page.instagram_business_account?.id,
          }),
        },
        create: {
          connectionId: connection.id,
          assetType: "facebook_page",
          externalId: page.id,
          name: page.name,
          extraData: JSON.stringify({
            category: page.category,
            followers: page.followers_count,
            pageAccessToken: page.access_token,
            instagramAccountId: page.instagram_business_account?.id,
          }),
        },
      });
    }

    for (const ig of igAccounts) {
      await prisma.platformAsset.upsert({
        where: {
          connectionId_assetType_externalId: {
            connectionId: connection.id,
            assetType: "instagram",
            externalId: ig.id,
          },
        },
        update: {
          name: ig.username ?? ig.name ?? ig.id,
          extraData: JSON.stringify({ followers: ig.followers_count, profilePicture: ig.profile_picture_url }),
        },
        create: {
          connectionId: connection.id,
          assetType: "instagram",
          externalId: ig.id,
          name: ig.username ?? ig.name ?? ig.id,
          extraData: JSON.stringify({ followers: ig.followers_count, profilePicture: ig.profile_picture_url }),
        },
      });
    }

    // 7. לוג סנכרון
    await prisma.syncLog.create({
      data: {
        platform: "meta",
        clientId,
        connectionId: connection.id,
        syncType: "assets_discovery",
        status: "success",
        recordsFetched: adAccounts.length + pages.length + igAccounts.length,
      },
    });

    return NextResponse.redirect(`${origin}/clients/${clientId}?meta_connected=1`);
  } catch (err) {
    console.error("[Meta Callback] error:", err);
    const message = err instanceof Error ? err.message : "unknown";
    await prisma.syncLog.create({
      data: {
        platform: "meta",
        clientId,
        syncType: "assets_discovery",
        status: "error",
        errorMessage: message,
      },
    });
    return NextResponse.redirect(`${origin}/clients/${clientId}?meta_error=${encodeURIComponent(message)}`);
  }
}
