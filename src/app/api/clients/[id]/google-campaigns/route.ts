import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/clients/[id]/google-campaigns?since=...&until=...
 */
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

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { currency: true },
  });

  const insights = await prisma.googleAdsInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
  });

  // Aggregate by campaign
  const campaignMap = new Map<string, {
    id: string; name: string; status: string; channelType: string;
    budget: number;
    spend: number; impressions: number; clicks: number;
    conversions: number; conversionsValue: number;
    costPerConversion: number; ctr: number;
    averageCpc: number; averageCpm: number;
    interactions: number; allConversions: number; allConversionsValue: number;
    videoViews: number; videoQuartile100: number;
    searchImprShare: number; contentImprShare: number;
    days: number;
  }>();

  for (const row of insights) {
    const existing = campaignMap.get(row.campaignId);
    if (existing) {
      existing.spend += row.spend;
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.conversions += row.conversions;
      existing.conversionsValue += row.conversionsValue;
      existing.interactions += row.interactions;
      existing.allConversions += row.allConversions;
      existing.allConversionsValue += row.allConversionsValue;
      existing.videoViews += row.videoViews;
      existing.days++;
    } else {
      campaignMap.set(row.campaignId, {
        id: row.campaignId,
        name: row.campaignName,
        status: row.campaignStatus,
        channelType: row.channelType,
        budget: Number(row.budgetMicros) / 1_000_000,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        conversionsValue: row.conversionsValue,
        costPerConversion: 0, // computed below
        ctr: 0,
        averageCpc: 0,
        averageCpm: 0,
        interactions: row.interactions,
        allConversions: row.allConversions,
        allConversionsValue: row.allConversionsValue,
        videoViews: row.videoViews,
        videoQuartile100: row.videoQuartile100,
        searchImprShare: row.searchImprShare,
        contentImprShare: row.contentImprShare,
        days: 1,
      });
    }
  }

  const campaigns = Array.from(campaignMap.values()).map((c) => ({
    ...c,
    costPerConversion: c.conversions > 0 ? c.spend / c.conversions : 0,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    averageCpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    averageCpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
    roas: c.spend > 0 ? c.conversionsValue / c.spend : 0,
  }));

  campaigns.sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    currency: client?.currency ?? "ILS",
    campaigns,
    range: { since, until },
    totalRows: insights.length,
  });
}
