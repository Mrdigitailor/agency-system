import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * שליפת ביצועים של לקוח מ-MetaInsightDaily
 * GET /api/clients/[id]/performance?since=YYYY-MM-DD&until=YYYY-MM-DD
 * ברירת מחדל: החודש הנוכחי
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);

  // ברירת מחדל: החודש הנוכחי
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  const since = searchParams.get("since") ?? monthStart;
  const until = searchParams.get("until") ?? today;

  const insights = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
  });

  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
  const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalPurchases = insights.reduce((s, i) => s + i.purchases, 0);
  const totalPurchaseValue = insights.reduce((s, i) => s + i.purchaseValue, 0);
  const totalLeads = insights.reduce((s, i) => s + i.leads, 0);

  const avgCostPerConv = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

  // תאריך הסנכרון האחרון
  const lastSync = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    select: { lastSyncAt: true },
  });

  return NextResponse.json({
    range: { since, until },
    hasMetaData: insights.length > 0,
    totalSpend,
    totalConversions,
    totalClicks,
    totalImpressions,
    totalPurchases,
    totalPurchaseValue,
    totalLeads,
    avgCostPerConv,
    avgCostPerLead,
    roas,
    lastSync: lastSync?.lastSyncAt ?? null,
  });
}
