import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// OAuth callback — כרגע placeholder שיוצר חיבור דמו
// ב-API האמיתי: מקבל code, מחליף ל-access_token, שומר ב-DB, שולף את הנכסים
export async function GET(req: Request, { params }: { params: Promise<{ id: string; platform: string }> }) {
  const { id: clientId, platform } = await params;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // חזרה לעמוד הלקוח עם סטטוס
  const redirectBase = `${new URL(req.url).origin}/clients/${clientId}`;

  if (error) {
    return NextResponse.redirect(`${redirectBase}?connect_error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${redirectBase}?connect_error=no_code`);
  }

  // === כאן יהיה קוד אמיתי להחלפת code ל-access_token ===
  // const tokenRes = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", { ... });
  // const { access_token, expires_in } = await tokenRes.json();
  // === ===

  // DEMO: יצירת חיבור placeholder עם נכסי דמו
  const demoData = getDemoDataForPlatform(platform);

  const connection = await prisma.platformConnection.upsert({
    where: { clientId_platform: { clientId, platform } },
    update: {
      accessToken: `demo_token_${Date.now()}`,
      accountName: demoData.accountName,
      accountEmail: demoData.accountEmail,
      tokenExpiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      isActive: true,
      lastSyncAt: new Date(),
    },
    create: {
      clientId,
      platform,
      accessToken: `demo_token_${Date.now()}`,
      accountName: demoData.accountName,
      accountEmail: demoData.accountEmail,
      tokenExpiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      lastSyncAt: new Date(),
    },
  });

  // יצירת נכסי דמו
  for (const asset of demoData.assets) {
    await prisma.platformAsset.upsert({
      where: {
        connectionId_assetType_externalId: {
          connectionId: connection.id,
          assetType: asset.assetType,
          externalId: asset.externalId,
        },
      },
      update: { name: asset.name, extraData: JSON.stringify(asset.extraData ?? {}) },
      create: {
        connectionId: connection.id,
        assetType: asset.assetType,
        externalId: asset.externalId,
        name: asset.name,
        extraData: JSON.stringify(asset.extraData ?? {}),
      },
    });
  }

  return NextResponse.redirect(`${redirectBase}?connect_success=${platform}`);
}

function getDemoDataForPlatform(platform: string) {
  switch (platform) {
    case "meta":
      return {
        accountName: "עסק דמו",
        accountEmail: "demo@example.com",
        assets: [
          { assetType: "ad_account", externalId: "act_123456789", name: "חשבון מודעות ראשי", extraData: { currency: "ILS" } },
          { assetType: "ad_account", externalId: "act_987654321", name: "חשבון מודעות שני", extraData: { currency: "ILS" } },
          { assetType: "facebook_page", externalId: "page_111", name: "עמוד פייסבוק עסקי", extraData: { followers: 5420 } },
          { assetType: "instagram", externalId: "ig_222", name: "@business_instagram", extraData: { followers: 12300 } },
        ],
      };
    case "google_ads":
      return {
        accountName: "Google Ads Account",
        accountEmail: "demo@gmail.com",
        assets: [
          { assetType: "google_ads_account", externalId: "123-456-7890", name: "חשבון Google Ads ראשי", extraData: { currency: "ILS" } },
          { assetType: "ga4_property", externalId: "GA4-111222", name: "GA4 - Main Website", extraData: {} },
        ],
      };
    case "tiktok":
      return {
        accountName: "TikTok Business",
        accountEmail: "demo@tiktok.com",
        assets: [
          { assetType: "tiktok_account", externalId: "tt_account_001", name: "חשבון TikTok Ads", extraData: { currency: "ILS" } },
        ],
      };
    default:
      return { accountName: "", accountEmail: "", assets: [] };
  }
}
