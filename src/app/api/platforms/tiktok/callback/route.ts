import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { exchangeToken, listAdvertisers } from "@/lib/api/tiktok/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const authCode = searchParams.get("auth_code");
  const state = searchParams.get("state");
  const origin = new URL(req.url).origin;

  if (!authCode || !state) {
    return NextResponse.redirect(`${origin}/clients?tiktok_error=missing_params`);
  }

  let decoded: { clientId: string; userId: string };
  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  } catch {
    return NextResponse.redirect(`${origin}/clients?tiktok_error=invalid_state`);
  }

  const { clientId } = decoded;

  try {
    // 1. Exchange code for token
    const tokenData = await exchangeToken(authCode);
    console.log(`[TikTok Callback] Got token, ${tokenData.advertiser_ids?.length ?? 0} advertiser IDs`);

    // 2. Save connection
    const conn = await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "tiktok" } },
      update: {
        accessToken: tokenData.access_token,
        isActive: true,
      },
      create: {
        clientId,
        platform: "tiktok",
        accessToken: tokenData.access_token,
      },
    });

    // 3. Fetch advertiser details
    try {
      const advertisers = await listAdvertisers(tokenData.access_token);
      console.log(`[TikTok Callback] Found ${advertisers.length} advertisers`);

      for (const adv of advertisers) {
        await prisma.platformAsset.upsert({
          where: {
            connectionId_assetType_externalId: {
              connectionId: conn.id,
              assetType: "tiktok_ad_account",
              externalId: String(adv.advertiser_id),
            },
          },
          update: { name: adv.advertiser_name },
          create: {
            connectionId: conn.id,
            assetType: "tiktok_ad_account",
            externalId: String(adv.advertiser_id),
            name: adv.advertiser_name,
          },
        });
      }
    } catch (err) {
      console.error("[TikTok Callback] Could not list advertisers:", err);
    }

    return NextResponse.redirect(`${origin}/clients/${clientId}?tiktok_connected=1`);
  } catch (err) {
    console.error("[TikTok Callback]", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(`${origin}/clients/${clientId}?tiktok_error=${encodeURIComponent(msg)}`);
  }
}
