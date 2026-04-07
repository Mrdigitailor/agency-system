import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { countConversions } from "@/lib/utils/metaMetrics";

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
    select: { metaConversionEvent: true },
  });
  const selectedEventRaw = client?.metaConversionEvent ?? "";

  const insights = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
  });

  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalPurchases = insights.reduce((s, i) => s + i.purchases, 0);
  const totalPurchaseValue = insights.reduce((s, i) => s + i.purchaseValue, 0);
  const totalLeads = insights.reduce((s, i) => s + i.leads, 0);

  // חישוב המרות דרך ה-helper שתומך ב-multi-select + JSON array
  const conversions = countConversions(insights, selectedEventRaw);
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

  console.log(`[Performance] client=${clientId} | event=${selectedEventRaw} | spend=${totalSpend} | conv=${conversions} | CPA=${Math.round(avgCostPerConv)} | insights=${insights.length}`);

  return NextResponse.json({
    range: { since, until },
    hasMetaData: insights.length > 0,
    totalSpend,
    totalConversions: conversions,
    totalClicks,
    totalImpressions,
    totalPurchases,
    totalPurchaseValue,
    totalLeads,
    avgCostPerConv,
    roas,
    selectedEvent: selectedEventRaw,
    lastSync: lastSync?.lastSyncAt ?? null,
    lastOptimization: lastOpt?.date ?? (lastOpt?.createdAt ? lastOpt.createdAt.toISOString().split("T")[0] : null),
  });
}
