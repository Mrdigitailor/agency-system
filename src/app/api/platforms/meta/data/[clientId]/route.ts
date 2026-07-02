import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { daysAgoIL, todayIL } from "@/lib/utils/ildate";

/**
 * שליפת נתוני Meta מסונכרנים של לקוח
 * GET /api/platforms/meta/data/[clientId]?since=YYYY-MM-DD&until=YYYY-MM-DD
 */
export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since") ?? daysAgoIL(30);
  const until = searchParams.get("until") ?? todayIL();

  const [insights, pagePosts, igMedia] = await Promise.all([
    prisma.metaInsightDaily.findMany({
      where: { clientId, date: { gte: since, lte: until } },
      orderBy: { date: "desc" },
    }),
    prisma.metaPagePost.findMany({
      where: { clientId, createdTime: { gte: new Date(since) } },
      orderBy: { createdTime: "desc" },
      take: 20,
    }),
    prisma.metaInstagramMedia.findMany({
      where: { clientId, timestamp: { gte: new Date(since) } },
      orderBy: { timestamp: "desc" },
      take: 20,
    }),
  ]);

  // KPIs מצטברים
  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
  const totalPurchases = insights.reduce((s, i) => s + i.purchases, 0);
  const totalPurchaseValue = insights.reduce((s, i) => s + i.purchaseValue, 0);
  const totalLeads = insights.reduce((s, i) => s + i.leads, 0);
  const totalLinkClicks = insights.reduce((s, i) => s + i.linkClicks, 0);
  const totalLandingPageViews = insights.reduce((s, i) => s + i.landingPageViews, 0);
  const totalVideoViews = insights.reduce((s, i) => s + i.videoViews, 0);
  const totalReach = insights.reduce((s, i) => s + i.reach, 0);

  const avgCostPerConv = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

  // גרף יומי
  const dailyMap = new Map<string, { spend: number; conversions: number; clicks: number; impressions: number }>();
  for (const ins of insights) {
    const e = dailyMap.get(ins.date) ?? { spend: 0, conversions: 0, clicks: 0, impressions: 0 };
    e.spend += ins.spend;
    e.conversions += ins.conversions;
    e.clicks += ins.clicks;
    e.impressions += ins.impressions;
    dailyMap.set(ins.date, e);
  }
  const dailyChart = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // קמפיינים מצטברים
  const campaignMap = new Map<string, { name: string; spend: number; conversions: number; clicks: number; impressions: number; purchases: number; leads: number; purchaseValue: number }>();
  for (const ins of insights) {
    if (ins.level !== "campaign") continue;
    const e = campaignMap.get(ins.externalId) ?? { name: ins.name, spend: 0, conversions: 0, clicks: 0, impressions: 0, purchases: 0, leads: 0, purchaseValue: 0 };
    e.spend += ins.spend;
    e.conversions += ins.conversions;
    e.clicks += ins.clicks;
    e.impressions += ins.impressions;
    e.purchases += ins.purchases;
    e.leads += ins.leads;
    e.purchaseValue += ins.purchaseValue;
    campaignMap.set(ins.externalId, e);
  }
  const campaigns = Array.from(campaignMap.entries())
    .map(([id, v]) => ({
      id, ...v,
      cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
      cpa: v.conversions > 0 ? v.spend / v.conversions : 0,
      roas: v.spend > 0 ? v.purchaseValue / v.spend : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    range: { since, until },
    kpis: {
      totalSpend, totalConversions, totalImpressions, totalClicks, totalReach,
      totalPurchases, totalPurchaseValue, totalLeads, totalLinkClicks,
      totalLandingPageViews, totalVideoViews,
      avgCostPerConv, avgCostPerLead, avgCtr, avgCpc, avgCpm, roas,
    },
    dailyChart,
    campaigns,
    pagePosts: pagePosts.map((p) => ({
      id: p.id, externalId: p.externalId, message: p.message,
      permalink: p.permalink, mediaType: p.mediaType, mediaUrl: p.mediaUrl,
      createdTime: p.createdTime, reach: p.reach, impressions: p.impressions,
      engagement: p.engagement, reactions: p.reactions, comments: p.comments,
      shares: p.shares, clicks: p.clicks, videoViews: p.videoViews,
    })),
    igMedia: igMedia.map((m) => ({
      id: m.id, externalId: m.externalId, caption: m.caption,
      permalink: m.permalink, mediaType: m.mediaType, mediaUrl: m.mediaUrl,
      thumbnailUrl: m.thumbnailUrl, timestamp: m.timestamp, reach: m.reach,
      impressions: m.impressions, likes: m.likes, comments: m.comments,
      saves: m.saves, videoViews: m.videoViews,
    })),
  });
}
