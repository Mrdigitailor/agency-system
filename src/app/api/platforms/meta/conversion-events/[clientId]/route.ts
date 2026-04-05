import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * שליפת כל האירועים הזמינים (standard + custom) של חיבור Meta של הלקוח
 * GET /api/platforms/meta/conversion-events/[clientId]
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
  });
  if (!connection) return NextResponse.json({ events: [] });

  const events = await prisma.platformAsset.findMany({
    where: { connectionId: connection.id, assetType: "conversion_event" },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      externalId: e.externalId,
      ...JSON.parse(e.extraData ?? "{}"),
    })),
  });
}
