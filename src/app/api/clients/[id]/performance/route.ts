import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { countConversions } from "@/lib/utils/metaMetrics";
import { countGoogleConversions, breakdownGoogleConversions } from "@/lib/utils/googleMetrics";
import { countMetaCampaignResults } from "@/lib/utils/campaignResults";

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
  // שליפה חסינה — אם העמודה עדיין לא קיימת ב-DB (לפני db push) לא לשבור את העמוד
  let excludedCampaigns: string[] = [];
  try {
    const ec = await prisma.client.findUnique({ where: { id: clientId }, select: { excludedCampaigns: true } });
    const p = JSON.parse(ec?.excludedCampaigns ?? "[]");
    if (Array.isArray(p)) excludedCampaigns = p.filter((x) => typeof x === "string");
  } catch { /* עמודה עדיין לא קיימת / JSON לא תקין */ }

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
  // ספירה פר-קמפיין לפי ה-Result של כל קמפיין (מחריג קמפיינים שסומנו), במקום סכום-אירועים על כל החשבון
  const metaResults = countMetaCampaignResults(insights, excludedCampaigns);
  const metaConversions = metaResults.total;
  const metaConversionsLegacy = countConversions(insights, selectedEventRaw); // לצורך לוג/השוואה בלבד

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

  // פירוק מטא לפי סוג-תוצאה (מהספירה פר-קמפיין, בלי המוחרגים) — ל-tooltip
  const RESULT_LABELS: Record<string, string> = { leads: "לידים", registrations: "הרשמות", purchases: "רכישות", messages: "שיחות", none: "אחר" };
  const metaByType = new Map<string, number>();
  for (const p of metaResults.perCampaign) {
    if (p.excluded || p.count === 0 || p.resultType === "none") continue;
    metaByType.set(p.resultType, (metaByType.get(p.resultType) ?? 0) + p.count);
  }
  const metaTooltip = [...metaByType.entries()].map(([t, c]) => ({ label: RESULT_LABELS[t] ?? t, count: c })).sort((a, b) => b.count - a.count);

  console.log(`[Performance] client=${clientId} | range=${since}→${until}`);
  console.log(`  Meta: spend=${metaSpend.toFixed(2)}, perCampaignResults=${metaConversions} (legacy sum=${metaConversionsLegacy}), excluded=${excludedCampaigns.length}`);
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
      meta: metaTooltip,
      google: breakdownGoogleConversions(gadsInsights, googleSelectedRaw),
      tiktok: ttConversions > 0 ? [{ label: "המרות (TikTok)", count: Math.round(ttConversions) }] : [],
    },
    // ספירה פר-קמפיין (מטא) — לניהול החרגות בממשק
    metaCampaignResults: metaResults.perCampaign,
    selectedEvent: selectedEventRaw,
    lastSync: lastSync?.lastSyncAt ?? null,
    lastOptimization: lastOpt?.date ?? (lastOpt?.createdAt ? lastOpt.createdAt.toISOString().split("T")[0] : null),
  });
}
