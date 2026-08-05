import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { countConversions, breakdownConversions, breakdownConversionsLabeled } from "@/lib/utils/metaMetrics";
import { countGoogleConversions, breakdownGoogleConversions } from "@/lib/utils/googleMetrics";

/**
 * GET /api/clients/[id]/performance?since=...&until=...
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
    select: { metaConversionEvent: true, googleConversionAction: true },
  });
  const selectedEventRaw = client?.metaConversionEvent ?? "";
  const googleSelectedRaw = client?.googleConversionAction ?? "";

  // Meta Insights — level="campaign" בלבד (אחרת adset+ad מסכמים פי 3)
  const insights = await prisma.metaInsightDaily.findMany({
    where: { clientId, level: "campaign", date: { gte: since, lte: until } },
  });

  const metaSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalPurchases = insights.reduce((s, i) => s + i.purchases, 0);
  const totalPurchaseValue = insights.reduce((s, i) => s + i.purchaseValue, 0);
  const totalLeads = insights.reduce((s, i) => s + i.leads, 0);
  const metaConversions = countConversions(insights, selectedEventRaw);

  // Google Ads Insights
  const gadsInsights = await prisma.googleAdsInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
  });
  const gadsSpend = gadsInsights.reduce((s, i) => s + i.spend, 0);
  const gadsConversions = countGoogleConversions(gadsInsights, googleSelectedRaw);

  // TikTok Insights
  const ttInsights = await prisma.tikTokInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
  });
  const ttSpend = ttInsights.reduce((s, i) => s + i.spend, 0);
  const ttConversions = ttInsights.reduce((s, i) => s + i.conversions, 0);

  // Combined
  const totalSpend = metaSpend + gadsSpend + ttSpend;
  const conversions = metaConversions + gadsConversions + ttConversions;
  const avgCostPerConv = conversions > 0 ? totalSpend / conversions : 0;
  const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

  const lastSync = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    select: { lastSyncAt: true },
  });

  const lastOpt = await prisma.optimization.findFirst({
    where: { clientId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { date: true, createdAt: true },
  });

  const metaBreakdown = breakdownConversions(insights, selectedEventRaw);
  console.log(`[Performance] client=${clientId} | event="${selectedEventRaw}" | range=${since}→${until}`);
  console.log(`  Meta: spend=${metaSpend.toFixed(2)}, filteredConversions=${metaConversions}, rawConversionsField=${insights.reduce((s, i) => s + i.conversions, 0)}, rawLeadsField=${totalLeads}, rawPurchasesField=${totalPurchases}`);
  console.log(`  Meta breakdown by event:`, metaBreakdown.map((b) => `${b.event}=${b.count}`).join(", "));
  console.log(`  Google: spend=${gadsSpend.toFixed(2)}, conversions=${gadsConversions}`);
  console.log(`  TikTok: spend=${ttSpend.toFixed(2)}, conversions=${ttConversions}`);
  console.log(`  Total: spend=${totalSpend.toFixed(2)}, conversions=${conversions}, CPA=${avgCostPerConv.toFixed(2)}`);

  return NextResponse.json({
    range: { since, until },
    hasMetaData: insights.length > 0 || gadsInsights.length > 0,
    totalSpend,
    totalConversions: conversions,
    totalClicks,
    totalImpressions,
    totalPurchases,
    totalPurchaseValue,
    totalLeads,
    avgCostPerConv,
    roas,
    // breakdown by platform
    metaSpend,
    metaConversions,
    gadsSpend,
    gadsConversions,
    ttSpend,
    ttConversions,
    // פירוק המרות פר-פלטפורמה לפי סוג — לתצוגת שקיפות ב-tooltip
    conversionBreakdown: {
      meta: breakdownConversionsLabeled(insights, selectedEventRaw),
      google: breakdownGoogleConversions(gadsInsights, googleSelectedRaw),
      tiktok: ttConversions > 0 ? [{ label: "המרות (TikTok)", count: Math.round(ttConversions) }] : [],
    },
    selectedEvent: selectedEventRaw,
    lastSync: lastSync?.lastSyncAt ?? null,
    lastOptimization: lastOpt?.date ?? (lastOpt?.createdAt ? lastOpt.createdAt.toISOString().split("T")[0] : null),
  });
}
