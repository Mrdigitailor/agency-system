import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { fetchAdAccounts, fetchPages, fetchInstagramAccounts } from "@/lib/api/meta/assets";
import { fetchPixels } from "@/lib/api/meta/pixels";

/**
 * POST /api/platforms/meta/refresh-assets/[clientId]
 * body: { type?: "all" | "pixels", adAccountId?: string, force?: boolean }
 *
 * Lazy loading — שואב נכסים לפי דרישה:
 * - type="all" (default): ad accounts, pages, IG (בלי פיקסלים)
 * - type="pixels": פיקסלים רק מחשבון מודעות ספציפי
 * - force=true: מתעלם מ-cache
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const type = body.type ?? "all";
  const force = body.force ?? false;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: true },
  });

  if (!connection) {
    return NextResponse.json({ error: "אין חיבור Meta פעיל" }, { status: 404 });
  }

  // Cache — אם נכסים כבר נשאבו ב-24 שעות האחרונות ולא force
  const hasAssets = connection.assets.some((a) => a.assetType === "ad_account");
  const lastFetch = connection.lastSyncAt;
  const cacheValid = hasAssets && lastFetch && !force && (Date.now() - lastFetch.getTime() < 24 * 60 * 60 * 1000);

  if (cacheValid && type === "all") {
    return NextResponse.json({ cached: true, assetCount: connection.assets.length });
  }

  const accessToken = connection.accessToken;

  try {
    if (type === "pixels" && body.adAccountId) {
      // שלב 3 — פיקסלים רק מחשבון ספציפי
      const pixels = await fetchPixels(body.adAccountId, accessToken);
      for (const pixel of pixels) {
        await prisma.platformAsset.upsert({
          where: { connectionId_assetType_externalId: { connectionId: connection.id, assetType: "pixel", externalId: pixel.id } },
          update: { name: pixel.name, extraData: JSON.stringify({ lastFiredTime: pixel.last_fired_time, adAccountId: body.adAccountId }) },
          create: { connectionId: connection.id, assetType: "pixel", externalId: pixel.id, name: pixel.name, extraData: JSON.stringify({ lastFiredTime: pixel.last_fired_time, adAccountId: body.adAccountId }) },
        });
      }
      return NextResponse.json({ pixels: pixels.length });
    }

    // שלב 2 — שאיבת ad accounts, pages, IG במקביל
    const [adAccounts, pages] = await Promise.all([
      fetchAdAccounts(accessToken).catch(() => []),
      fetchPages(accessToken).catch(() => []),
    ]);
    const igAccounts = await fetchInstagramAccounts(pages, accessToken).catch(() => []);

    // שלב 2.5 — שאיבת פיקסלים מכל חשבונות המודעות במקביל
    const pixelsByAccount = await Promise.all(
      adAccounts.map(async (acc) => ({
        adAccountId: acc.id,
        pixels: await fetchPixels(acc.id, accessToken).catch(() => []),
      }))
    );

    // שמירה — ad accounts
    for (const acc of adAccounts) {
      await prisma.platformAsset.upsert({
        where: { connectionId_assetType_externalId: { connectionId: connection.id, assetType: "ad_account", externalId: acc.id } },
        update: { name: acc.name },
        create: { connectionId: connection.id, assetType: "ad_account", externalId: acc.id, name: acc.name, extraData: JSON.stringify({ currency: acc.currency }) },
      });
    }

    // pixels (מכל חשבונות המודעות)
    let totalPixels = 0;
    for (const { adAccountId, pixels } of pixelsByAccount) {
      for (const pixel of pixels) {
        await prisma.platformAsset.upsert({
          where: { connectionId_assetType_externalId: { connectionId: connection.id, assetType: "pixel", externalId: pixel.id } },
          update: { name: pixel.name, extraData: JSON.stringify({ lastFiredTime: pixel.last_fired_time, adAccountId }) },
          create: { connectionId: connection.id, assetType: "pixel", externalId: pixel.id, name: pixel.name, extraData: JSON.stringify({ lastFiredTime: pixel.last_fired_time, adAccountId }) },
        });
        totalPixels++;
      }
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

    // עדכון lastSyncAt
    await prisma.platformConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      adAccounts: adAccounts.length,
      pages: pages.length,
      instagram: igAccounts.length,
      pixels: totalPixels,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
