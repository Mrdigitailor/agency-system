import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { fetchAdAccounts, fetchPages, fetchInstagramAccounts } from "@/lib/api/meta/assets";
import { fetchPixels } from "@/lib/api/meta/pixels";

/**
 * POST /api/platforms/meta/refresh-assets/[clientId]
 * רענון רשימת נכסים — שואב מחדש ad accounts, pages, IG, pixels
 * בלי צורך ב-OAuth מחדש (משתמש ב-token הקיים)
 */
export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
  });

  if (!connection) {
    return NextResponse.json({ error: "אין חיבור Meta פעיל" }, { status: 404 });
  }

  const accessToken = connection.accessToken;
  let added = 0;

  try {
    // שליפת כל סוגי הנכסים
    const [adAccounts, pages] = await Promise.all([
      fetchAdAccounts(accessToken).catch(() => []),
      fetchPages(accessToken).catch(() => []),
    ]);
    const igAccounts = await fetchInstagramAccounts(pages, accessToken).catch(() => []);

    // ad accounts
    for (const acc of adAccounts) {
      const result = await prisma.platformAsset.upsert({
        where: { connectionId_assetType_externalId: { connectionId: connection.id, assetType: "ad_account", externalId: acc.id } },
        update: { name: acc.name },
        create: { connectionId: connection.id, assetType: "ad_account", externalId: acc.id, name: acc.name, extraData: JSON.stringify({ currency: acc.currency }) },
      });
      if (result) added++;
    }

    // pages
    for (const page of pages) {
      await prisma.platformAsset.upsert({
        where: { connectionId_assetType_externalId: { connectionId: connection.id, assetType: "facebook_page", externalId: page.id } },
        update: { name: page.name, extraData: JSON.stringify({ category: page.category, followers: page.followers_count, pageAccessToken: page.access_token, instagramAccountId: page.instagram_business_account?.id }) },
        create: { connectionId: connection.id, assetType: "facebook_page", externalId: page.id, name: page.name, extraData: JSON.stringify({ category: page.category, followers: page.followers_count, pageAccessToken: page.access_token, instagramAccountId: page.instagram_business_account?.id }) },
      });
    }

    // instagram
    for (const ig of igAccounts) {
      await prisma.platformAsset.upsert({
        where: { connectionId_assetType_externalId: { connectionId: connection.id, assetType: "instagram", externalId: ig.id } },
        update: { name: ig.username ?? ig.name ?? ig.id },
        create: { connectionId: connection.id, assetType: "instagram", externalId: ig.id, name: ig.username ?? ig.name ?? ig.id, extraData: JSON.stringify({ followers: ig.followers_count }) },
      });
    }

    // pixels — שואב מכל ad account
    let pixelCount = 0;
    for (const acc of adAccounts) {
      const pixels = await fetchPixels(acc.id, accessToken);
      for (const pixel of pixels) {
        await prisma.platformAsset.upsert({
          where: { connectionId_assetType_externalId: { connectionId: connection.id, assetType: "pixel", externalId: pixel.id } },
          update: { name: pixel.name, extraData: JSON.stringify({ lastFiredTime: pixel.last_fired_time, isUnified: pixel.is_unified_pixel, adAccountId: acc.id }) },
          create: { connectionId: connection.id, assetType: "pixel", externalId: pixel.id, name: pixel.name, extraData: JSON.stringify({ lastFiredTime: pixel.last_fired_time, isUnified: pixel.is_unified_pixel, adAccountId: acc.id }) },
        });
        pixelCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      adAccounts: adAccounts.length,
      pages: pages.length,
      instagram: igAccounts.length,
      pixels: pixelCount,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
