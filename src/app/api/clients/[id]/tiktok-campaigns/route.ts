import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const since = searchParams.get("since") ?? monthStart;
  const until = searchParams.get("until") ?? today;

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { currency: true } });

  const insights = await prisma.tikTokInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
  });

  const campaignMap = new Map<string, any>();
  for (const row of insights) {
    const existing = campaignMap.get(row.campaignId);
    if (existing) {
      existing.spend += row.spend;
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.reach += row.reach;
      existing.conversions += row.conversions;
      existing.videoViews += row.videoViews;
      existing.likes += row.likes;
      existing.comments += row.comments;
      existing.shares += row.shares;
      existing.follows += row.follows;
      existing.profileVisits += row.profileVisits;
      existing.days++;
    } else {
      campaignMap.set(row.campaignId, {
        id: row.campaignId,
        name: row.campaignName,
        status: row.campaignStatus,
        objectiveType: row.objectiveType,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        reach: row.reach,
        conversions: row.conversions,
        costPerConversion: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        frequency: row.frequency,
        videoViews: row.videoViews,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        follows: row.follows,
        profileVisits: row.profileVisits,
        days: 1,
      });
    }
  }

  const campaigns = Array.from(campaignMap.values()).map((c: any) => ({
    ...c,
    costPerConversion: c.conversions > 0 ? c.spend / c.conversions : 0,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
  }));

  campaigns.sort((a: any, b: any) => b.spend - a.spend);

  return NextResponse.json({ currency: client?.currency ?? "ILS", campaigns });
}
