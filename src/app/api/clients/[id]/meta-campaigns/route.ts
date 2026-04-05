import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { countConversions } from "@/lib/utils/metaMetrics";

/**
 * GET /api/clients/[id]/meta-campaigns?since=...&until=...
 * מחזיר רשימת קמפיינים מצטברת עם כל המטריקות
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

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { metaConversionEvent: true, currency: true },
  });
  const selectedEvent = client?.metaConversionEvent ?? "";

  const rows = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until }, level: "campaign" },
  });

  // קבץ לפי externalId (campaign id)
  const byCampaign = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byCampaign.has(r.externalId)) byCampaign.set(r.externalId, []);
    byCampaign.get(r.externalId)!.push(r);
  }

  const campaigns = Array.from(byCampaign.entries()).map(([externalId, items]) => {
    const name = items[0].name;
    const spend = items.reduce((s, i) => s + i.spend, 0);
    const impressions = items.reduce((s, i) => s + i.impressions, 0);
    const clicks = items.reduce((s, i) => s + i.clicks, 0);
    const reach = items.reduce((s, i) => s + i.reach, 0);
    const linkClicks = items.reduce((s, i) => s + i.linkClicks, 0);
    const landingPageViews = items.reduce((s, i) => s + i.landingPageViews, 0);
    const videoViews = items.reduce((s, i) => s + i.videoViews, 0);
    const videoThruplay = items.reduce((s, i) => s + i.videoThruplay, 0);
    const engagement = items.reduce((s, i) => s + i.engagement, 0);
    const purchases = items.reduce((s, i) => s + i.purchases, 0);
    const purchaseValue = items.reduce((s, i) => s + i.purchaseValue, 0);
    const leads = items.reduce((s, i) => s + i.leads, 0);

    const conversions = countConversions(items, selectedEvent);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const frequency = reach > 0 ? impressions / reach : 0;
    const costPerConversion = conversions > 0 ? spend / conversions : 0;
    const costPerLead = leads > 0 ? spend / leads : 0;
    const roas = spend > 0 ? purchaseValue / spend : 0;

    return {
      id: externalId, name,
      spend, impressions, clicks, reach, frequency, ctr, cpc, cpm,
      linkClicks, landingPageViews, videoViews, videoThruplay, engagement,
      conversions, costPerConversion, purchases, purchaseValue, leads, costPerLead, roas,
    };
  }).sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    currency: client?.currency ?? "ILS",
    selectedEvent,
    campaigns,
  });
}
