import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { parseConversionEvents, countConversions, breakdownConversions } from "@/lib/utils/metaMetrics";

/**
 * GET /api/debug/conversions/[clientId]
 * דיבאג — פירוט מלא של ספירת המרות ללקוח
 *
 * GET /api/debug/conversions/all
 * דיבאג — סיכום המרות לכל הלקוחות הפעילים
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;

  const now = new Date();
  const since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const until = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // --- ALL clients summary ---
  if (clientId === "all") {
    const clients = await prisma.client.findMany({
      where: { status: { not: "inactive" }, deletedAt: null },
      select: { id: true, name: true, metaConversionEvent: true },
    });

    const results = [];
    for (const c of clients) {
      const insights = await prisma.metaInsightDaily.findMany({
        where: { clientId: c.id, date: { gte: since, lte: until } },
      });

      const selectedEvents = parseConversionEvents(c.metaConversionEvent ?? "");
      const filteredConversions = countConversions(insights, c.metaConversionEvent ?? "");
      const rawConversionsField = insights.reduce((s, i) => s + i.conversions, 0);
      const breakdown = breakdownConversions(insights, c.metaConversionEvent ?? "");

      results.push({
        name: c.name,
        selectedEvents,
        filteredConversions,
        rawConversionsField,
        gap: rawConversionsField - filteredConversions,
        hasGap: rawConversionsField !== filteredConversions,
        breakdown,
      });
    }

    return NextResponse.json({
      range: { since, until },
      clients: results,
      clientsWithGap: results.filter((r) => r.hasGap).map((r) => r.name),
    });
  }

  // --- Single client detailed debug ---
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, metaConversionEvent: true },
  });

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const selectedEvents = parseConversionEvents(client.metaConversionEvent ?? "");

  const insights = await prisma.metaInsightDaily.findMany({ where: { clientId, level: "campaign", date: { gte: since, lte: until } },
    orderBy: { date: "asc" },
  });

  // Aggregate all action_types across all insights
  const actionTypeCounts: Record<string, number> = {};
  for (const ins of insights) {
    try {
      const parsed = JSON.parse(ins.actionsJson ?? "{}");
      const actions: Array<{ action_type: string; value: string }> = parsed.actions ?? [];
      for (const a of actions) {
        actionTypeCounts[a.action_type] = (actionTypeCounts[a.action_type] ?? 0) + (parseFloat(a.value) || 0);
      }
    } catch {}
  }

  const filteredConversions = countConversions(insights, client.metaConversionEvent ?? "");
  const breakdown = breakdownConversions(insights, client.metaConversionEvent ?? "");
  const rawConversionsField = insights.reduce((s, i) => s + i.conversions, 0);
  const rawLeadsField = insights.reduce((s, i) => s + i.leads, 0);
  const rawPurchasesField = insights.reduce((s, i) => s + i.purchases, 0);

  return NextResponse.json({
    client: client.name,
    range: { since, until },
    insightRows: insights.length,
    selectedEvents,
    filteredConversions,
    breakdown,
    rawFields: {
      conversions: rawConversionsField,
      leads: rawLeadsField,
      purchases: rawPurchasesField,
    },
    allActionTypes: Object.entries(actionTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        action_type: type,
        count,
        isSelected: selectedEvents.includes(type),
      })),
  });
}
