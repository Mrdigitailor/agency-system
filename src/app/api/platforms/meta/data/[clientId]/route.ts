import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * שליפת נתוני Meta מסונכרנים של לקוח (מה-DB, לא מה-API)
 * GET /api/platforms/meta/data/[clientId]
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  // 30 ימים אחרונים
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [insights, pagePosts, igMedia] = await Promise.all([
    prisma.metaInsightDaily.findMany({
      where: { clientId, date: { gte: since } },
      orderBy: { date: "desc" },
    }),
    prisma.metaPagePost.findMany({
      where: { clientId },
      orderBy: { createdTime: "desc" },
      take: 20,
    }),
    prisma.metaInstagramMedia.findMany({
      where: { clientId },
      orderBy: { timestamp: "desc" },
      take: 20,
    }),
  ]);

  // KPIs של 30 ימים אחרונים
  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
  const avgCostPerConv = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // קיבוץ לפי תאריך (לגרף)
  const dailyMap = new Map<string, { spend: number; conversions: number; clicks: number }>();
  for (const ins of insights) {
    const existing = dailyMap.get(ins.date) ?? { spend: 0, conversions: 0, clicks: 0 };
    existing.spend += ins.spend;
    existing.conversions += ins.conversions;
    existing.clicks += ins.clicks;
    dailyMap.set(ins.date, existing);
  }
  const dailyChart = Array.from(dailyMap.entries())
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // קיבוץ לפי קמפיין
  const campaignMap = new Map<string, { name: string; spend: number; conversions: number; clicks: number; impressions: number }>();
  for (const ins of insights) {
    if (ins.level !== "campaign") continue;
    const existing = campaignMap.get(ins.externalId) ?? { name: ins.name, spend: 0, conversions: 0, clicks: 0, impressions: 0 };
    existing.spend += ins.spend;
    existing.conversions += ins.conversions;
    existing.clicks += ins.clicks;
    existing.impressions += ins.impressions;
    campaignMap.set(ins.externalId, existing);
  }
  const campaigns = Array.from(campaignMap.entries())
    .map(([id, vals]) => ({ id, ...vals, cpc: vals.clicks > 0 ? vals.spend / vals.clicks : 0 }))
    .sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    kpis: {
      totalSpend, totalConversions, totalImpressions, totalClicks,
      avgCostPerConv, avgCtr,
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
