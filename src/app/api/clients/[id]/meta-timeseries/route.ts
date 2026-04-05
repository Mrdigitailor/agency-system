import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { countConversions } from "@/lib/utils/metaMetrics";

/**
 * GET /api/clients/[id]/meta-timeseries?metric=spend&since=...&until=...&event=...
 * מחזיר סדרת זמן יומית של המטריקה המבוקשת
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);

  const metric = searchParams.get("metric") ?? "spend";
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];
  const since = searchParams.get("since") ?? monthStart;
  const until = searchParams.get("until") ?? today;
  const eventOverride = searchParams.get("event");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { metaConversionEvent: true, currency: true },
  });
  const selectedEvent = eventOverride ?? client?.metaConversionEvent ?? "";

  // שלוף רק שורות ברמת campaign או account כדי לא לכפול
  const rows = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until }, level: "campaign" },
    orderBy: { date: "asc" },
  });

  // קבץ לפי תאריך
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  const series = Array.from(byDate.entries()).map(([date, items]) => {
    const spend = items.reduce((s, i) => s + i.spend, 0);
    const impressions = items.reduce((s, i) => s + i.impressions, 0);
    const clicks = items.reduce((s, i) => s + i.clicks, 0);
    const reach = items.reduce((s, i) => s + i.reach, 0);
    const linkClicks = items.reduce((s, i) => s + i.linkClicks, 0);
    const landingPageViews = items.reduce((s, i) => s + i.landingPageViews, 0);
    const videoViews = items.reduce((s, i) => s + i.videoViews, 0);
    const engagement = items.reduce((s, i) => s + i.engagement, 0);
    const purchases = items.reduce((s, i) => s + i.purchases, 0);
    const purchaseValue = items.reduce((s, i) => s + i.purchaseValue, 0);
    const leads = items.reduce((s, i) => s + i.leads, 0);
    const conversions = countConversions(items, selectedEvent);

    let value = 0;
    switch (metric) {
      case "spend": value = spend; break;
      case "impressions": value = impressions; break;
      case "reach": value = reach; break;
      case "clicks": value = clicks; break;
      case "link_clicks": value = linkClicks; break;
      case "landing_page_views": value = landingPageViews; break;
      case "video_views": value = videoViews; break;
      case "engagement": value = engagement; break;
      case "conversions": value = conversions; break;
      case "cost_per_conversion": value = conversions > 0 ? spend / conversions : 0; break;
      case "ctr": value = impressions > 0 ? (clicks / impressions) * 100 : 0; break;
      case "cpc": value = clicks > 0 ? spend / clicks : 0; break;
      case "cpm": value = impressions > 0 ? (spend / impressions) * 1000 : 0; break;
      case "leads": value = leads; break;
      case "cost_per_lead": value = leads > 0 ? spend / leads : 0; break;
      case "purchases": value = purchases; break;
      case "purchase_value": value = purchaseValue; break;
      case "roas": value = spend > 0 ? purchaseValue / spend : 0; break;
      default: value = 0;
    }

    return { date, value };
  });

  return NextResponse.json({
    currency: client?.currency ?? "ILS",
    metric,
    series,
  });
}
