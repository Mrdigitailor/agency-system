import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { countConversions } from "@/lib/utils/metaMetrics";
import { countMetaCampaignResults } from "@/lib/utils/campaignResults";
import { monthStartIL, todayIL } from "@/lib/utils/ildate";

/**
 * GET /api/clients/[id]/meta-campaigns?since=...&until=...
 * מחזיר רשימת קמפיינים מצטברת עם כל המטריקות
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);

  const since = searchParams.get("since") ?? monthStartIL();
  const until = searchParams.get("until") ?? todayIL();

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { metaConversionEvent: true, currency: true },
  });
  const selectedEvent = client?.metaConversionEvent ?? "";

  const rows = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: since, lte: until }, level: "campaign" },
  });

  // ספירת המרות פר-קמפיין לפי ה-Result (כמו בסקירה) — במקום סכום סוגי-אירוע
  // שמנפח (למשל lead + complete_registration). מכבד את החרגות הקמפיינים.
  let excludedCampaigns: string[] = [];
  try {
    const ec = await prisma.client.findUnique({ where: { id: clientId }, select: { excludedCampaigns: true } });
    const p = JSON.parse(ec?.excludedCampaigns ?? "[]");
    if (Array.isArray(p)) excludedCampaigns = p.filter((x) => typeof x === "string");
  } catch { /* עמודה עדיין לא קיימת */ }
  const resultByCampaign = new Map<string, number>();
  for (const r of countMetaCampaignResults(rows, excludedCampaigns).perCampaign) {
    resultByCampaign.set(r.campaignId, r.excluded ? 0 : r.count);
  }

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

    // חלץ שדות נוספים מ-actionsJson (first row has meta fields)
    let objective = "", bidStrategy = "", dailyBudget = 0, lifetimeBudget = 0;
    let uniqueClicks = 0, socialSpend = 0, inlineLinkClicks = 0, outboundClicks = 0;
    let qualityRanking = "", engagementRanking = "", conversionRanking = "";
    for (const item of items) {
      try {
        const raw = JSON.parse(item.actionsJson ?? "{}");
        if (raw.objective) objective = raw.objective;
        if (raw.bid_strategy) bidStrategy = raw.bid_strategy;
        if (raw.daily_budget) dailyBudget = parseFloat(raw.daily_budget) / 100 || 0;
        if (raw.lifetime_budget) lifetimeBudget = parseFloat(raw.lifetime_budget) / 100 || 0;
        uniqueClicks += parseInt(raw.unique_clicks) || 0;
        socialSpend += parseFloat(raw.social_spend) || 0;
        inlineLinkClicks += parseInt(raw.inline_link_clicks) || 0;
        outboundClicks += parseInt(raw.outbound_clicks?.[0]?.value ?? raw.outbound_clicks) || 0;
        if (raw.quality_ranking) qualityRanking = raw.quality_ranking;
        if (raw.engagement_rate_ranking) engagementRanking = raw.engagement_rate_ranking;
        if (raw.conversion_rate_ranking) conversionRanking = raw.conversion_rate_ranking;
      } catch {}
    }

    // conversions = ה-Result פר-קמפיין (לידים/רכישות/הרשמות לפי מה שהקמפיין
    // עושה אופטימיזציה), לא סכום כל האירועים הנבחרים. legacy נשמר להשוואה בלבד.
    const conversions = resultByCampaign.get(externalId) ?? 0;
    const conversionsLegacy = countConversions(items, selectedEvent);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const frequency = reach > 0 ? impressions / reach : 0;
    const costPerConversion = conversions > 0 ? spend / conversions : 0;
    const costPerLead = leads > 0 ? spend / leads : 0;
    const roas = spend > 0 ? purchaseValue / spend : 0;

    return {
      id: externalId, name, objective, bidStrategy,
      dailyBudget, lifetimeBudget,
      spend, socialSpend, impressions, clicks, uniqueClicks, reach, frequency, ctr, cpc, cpm,
      inlineLinkClicks, outboundClicks,
      linkClicks, landingPageViews, videoViews, videoThruplay, engagement,
      conversions, conversionsLegacy, costPerConversion, purchases, purchaseValue, leads, costPerLead, roas,
      qualityRanking, engagementRanking, conversionRanking,
    };
  }).sort((a, b) => b.spend - a.spend);

  return NextResponse.json({
    currency: client?.currency ?? "ILS",
    selectedEvent,
    campaigns,
  });
}
