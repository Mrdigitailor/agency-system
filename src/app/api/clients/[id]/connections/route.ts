import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

// רשימת חיבורי פלטפורמות של לקוח
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const { id } = await params;

  const connections = await prisma.platformConnection.findMany({
    where: { clientId: id, isActive: true },
    include: {
      assets: { orderBy: { name: "asc" } },
    },
    orderBy: { connectedAt: "desc" },
  });

  // הסרת tokens מהתגובה לאבטחה
  const safe = connections.map((c) => ({
    id: c.id,
    platform: c.platform,
    accountName: c.accountName,
    accountEmail: c.accountEmail,
    connectedAt: c.connectedAt,
    lastSyncAt: c.lastSyncAt,
    tokenExpiry: c.tokenExpiry,
    assets: c.assets.map((a) => ({
      id: a.id,
      assetType: a.assetType,
      externalId: a.externalId,
      name: a.name,
      isSelected: a.isSelected,
      extraData: JSON.parse(a.extraData ?? "{}"),
    })),
  }));

  return NextResponse.json(safe);
}
