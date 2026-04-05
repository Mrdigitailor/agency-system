import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * שליפת ביצועים של לקוח מ-MetaInsightDaily
 * מחשב נכון לפי metaConversionEvent שנבחר ללקוח
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  const since = searchParams.get("since") ?? monthStart;
  const until = searchParams.get("until") ?? today;

  // שלוף את הלקוח כדי לדעת איזה event type נחשב כהמרה
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { metaConversionEvent: true },
  });
  const selectedEvent = client?.metaConversionEvent ?? "";

  const insights = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
  });

  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalClicks = insights.reduce((s, i) => s + i.clicks, 0);
  const totalImpressions = insights.reduce((s, i) => s + i.impressions, 0);
  const totalPurchases = insights.reduce((s, i) => s + i.purchases, 0);
  const totalPurchaseValue = insights.reduce((s, i) => s + i.purchaseValue, 0);
  const totalLeads = insights.reduce((s, i) => s + i.leads, 0);

  // חישוב conversions לפי אירוע שנבחר
  let conversions = 0;
  let relevantSpend = totalSpend;

  if (selectedEvent === "purchase" || selectedEvent === "offsite_conversion.fb_pixel_purchase") {
    conversions = totalPurchases;
  } else if (selectedEvent === "lead" || selectedEvent === "offsite_conversion.fb_pixel_lead") {
    conversions = totalLeads;
  } else if (selectedEvent) {
    // custom event — לשלוף מ-actionsJson
    let customSum = 0;
    for (const ins of insights) {
      try {
        const parsed = JSON.parse(ins.actionsJson ?? "{}");
        const actions = parsed.actions as Array<{ action_type: string; value: string }> | undefined;
        if (actions) {
          for (const a of actions) {
            if (a.action_type === selectedEvent) customSum += parseFloat(a.value) || 0;
          }
        }
      } catch {}
    }
    conversions = customSum;
  } else {
    // ברירת מחדל — כל conversions
    conversions = insights.reduce((s, i) => s + i.conversions, 0);
  }

  const avgCostPerConv = conversions > 0 ? relevantSpend / conversions : 0;
  const roas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

  const lastSync = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    select: { lastSyncAt: true },
  });

  // שליפת תאריך האופטימיזציה האחרונה
  const lastOpt = await prisma.optimization.findFirst({
    where: { clientId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { date: true, createdAt: true },
  });

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
    selectedEvent,
    lastSync: lastSync?.lastSyncAt ?? null,
    lastOptimization: lastOpt?.date ?? (lastOpt?.createdAt ? lastOpt.createdAt.toISOString().split("T")[0] : null),
  });
}
