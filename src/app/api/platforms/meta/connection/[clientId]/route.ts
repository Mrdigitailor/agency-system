import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * שליפת חיבור Meta של לקוח + הנכסים שלו
 * GET /api/platforms/meta/connection/[clientId]
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: {
      assets: { orderBy: [{ assetType: "asc" }, { name: "asc" }] },
    },
  });

  if (!connection) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    connectionId: connection.id,
    accountName: connection.accountName,
    accountEmail: connection.accountEmail,
    connectedAt: connection.connectedAt,
    lastSyncAt: connection.lastSyncAt,
    tokenExpiry: connection.tokenExpiry,
    assets: connection.assets.map((a) => ({
      id: a.id,
      assetType: a.assetType,
      externalId: a.externalId,
      name: a.name,
      isSelected: a.isSelected,
      extraData: JSON.parse(a.extraData ?? "{}"),
    })),
  });
}
