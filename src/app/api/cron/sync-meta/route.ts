import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncClientMeta } from "@/lib/api/meta/sync";

/**
 * Cron יומי לסנכרון Meta — רץ כל לילה ב-03:00
 * מאובטח ב-CRON_SECRET
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");

  const expected = process.env.CRON_SECRET;
  const provided = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const aggregate = {
    connectionsProcessed: 0,
    adInsightsFetched: 0,
    pagePostsFetched: 0,
    igMediaFetched: 0,
    errors: [] as string[],
  };

  const connections = await prisma.platformConnection.findMany({
    where: { platform: "meta", isActive: true },
    select: { clientId: true },
    distinct: ["clientId"],
  });

  for (const conn of connections) {
    aggregate.connectionsProcessed++;
    const stats = await syncClientMeta(conn.clientId, 7); // 7 ימים אחרונים
    aggregate.adInsightsFetched += stats.adInsightsFetched;
    aggregate.pagePostsFetched += stats.pagePostsFetched;
    aggregate.igMediaFetched += stats.igMediaFetched;
    aggregate.errors.push(...stats.errors);
  }

  const durationMs = Date.now() - startTime;
  return NextResponse.json({ ...aggregate, durationMs });
}
