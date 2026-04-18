import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/clients/[id]/campaigns?platform=meta|google_ads
 * מחזיר רשימת קמפיינים ייחודית מהפלטפורמה הנבחרת
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const platform = new URL(req.url).searchParams.get("platform") ?? "meta";

  if (platform === "google_ads") {
    const rows = await prisma.googleAdsInsightDaily.findMany({
      where: { clientId: id },
      select: { campaignId: true, campaignName: true },
      distinct: ["campaignId"],
      orderBy: { date: "desc" },
      take: 500,
    });

    const seen = new Set<string>();
    const campaigns = rows
      .filter((r) => {
        if (seen.has(r.campaignId)) return false;
        seen.add(r.campaignId);
        return true;
      })
      .map((r) => ({ id: r.campaignId, name: r.campaignName || r.campaignId }));

    return NextResponse.json(campaigns);
  }

  // Default: Meta
  const rows = await prisma.metaInsightDaily.findMany({
    where: { clientId: id, level: "campaign" },
    select: { externalId: true, name: true },
    distinct: ["externalId"],
    orderBy: { date: "desc" },
    take: 500,
  });

  const seen = new Set<string>();
  const campaigns = rows
    .filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    })
    .map((r) => ({ id: r.externalId, name: r.name || r.externalId }));

  return NextResponse.json(campaigns);
}
