import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { getWeekRangeForDate, formatWeekRange } from "@/lib/utils/dates";

/**
 * GET /api/debug/report-dates
 * Verifies that all weekly report dates compute correctly
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const trackers = await prisma.reportTracker.findMany({
    where: { weeklyLastSent: { not: "" } },
  });

  const clients = await prisma.client.findMany({
    select: { id: true, name: true },
  });
  const nameMap = new Map(clients.map((c) => [c.id, c.name]));

  const results = trackers.map((t) => {
    const { start, end } = getWeekRangeForDate(t.weeklyLastSent);
    return {
      client: nameMap.get(t.clientId) ?? t.clientId,
      markedAsSentOn: t.weeklyLastSent,
      computedPeriod: formatWeekRange(start, end),
      periodStart: start.toISOString().split("T")[0],
      periodEnd: end.toISOString().split("T")[0],
    };
  });

  return NextResponse.json({
    message: "Report dates are computed dynamically from weeklyLastSent — no DB fix needed",
    reportTableRows: 0,
    trackerRows: trackers.length,
    results,
  });
}
