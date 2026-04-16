import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/clients/[id]/google-timeseries?metric=spend&since=...&until=...
 * Returns { series: [{ date, value }] }
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const metric = searchParams.get("metric") ?? "spend";

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const since = searchParams.get("since") ?? monthStart;
  const until = searchParams.get("until") ?? today;

  const rows = await prisma.googleAdsInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until } },
    orderBy: { date: "asc" },
  });

  // Aggregate by date
  const dateMap = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const existing = dateMap.get(row.date) ?? { sum: 0, count: 0 };

    let val = 0;
    switch (metric) {
      case "spend": val = row.spend; break;
      case "impressions": val = row.impressions; break;
      case "clicks": val = row.clicks; break;
      case "conversions": val = row.conversions; break;
      case "conversionsValue": val = row.conversionsValue; break;
      case "costPerConversion": val = row.costPerConversion; break;
      case "ctr": val = row.ctr; break;
      case "averageCpc": val = row.averageCpc; break;
      case "averageCpm": val = row.averageCpm; break;
      case "videoViews": val = row.videoViews; break;
      case "searchImprShare": val = row.searchImprShare; break;
      default: val = row.spend;
    }

    existing.sum += val;
    existing.count++;
    dateMap.set(row.date, existing);
  }

  const isRateMetric = ["ctr", "averageCpc", "averageCpm", "costPerConversion", "searchImprShare"].includes(metric);

  const series = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date,
      value: isRateMetric ? (count > 0 ? sum / count : 0) : sum,
    }));

  return NextResponse.json({ series });
}
