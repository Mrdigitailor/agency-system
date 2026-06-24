import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { searchStream, getValidGoogleToken } from "@/lib/api/google-ads/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/platforms/google-ads/conversion-actions/[clientId]
 * מחזיר את רשימת ה-conversion actions הפעילות של חשבון הגוגל — מקור לבורר.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "google_ads", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "google_ads_account" } } },
  });
  if (!connection || connection.assets.length === 0) {
    return NextResponse.json({ actions: [], error: "אין חשבון Google Ads מחובר" });
  }

  let token: string;
  try {
    token = await getValidGoogleToken(connection);
  } catch {
    return NextResponse.json({ actions: [], error: "צריך לחבר מחדש את Google Ads" });
  }

  const asset = connection.assets[0];
  const extra = JSON.parse(asset.extraData || "{}");
  const mccId = extra.mccId ?? "";

  const query = `
    SELECT conversion_action.name, conversion_action.category, conversion_action.status
    FROM conversion_action
    WHERE conversion_action.status = 'ENABLED'
  `;

  try {
    const rows = await searchStream(asset.externalId, query, {
      accessToken: token,
      loginCustomerId: mccId || undefined,
    });
    const seen = new Set<string>();
    const actions: Array<{ name: string; category: string }> = [];
    for (const r of rows) {
      const ca = r.conversionAction ?? {};
      const name = ca.name ?? "";
      if (!name || seen.has(name)) continue;
      seen.add(name);
      actions.push({ name, category: ca.category ?? "" });
    }
    return NextResponse.json({ actions });
  } catch (err) {
    return NextResponse.json({ actions: [], error: (err as Error).message?.slice(0, 120) });
  }
}
