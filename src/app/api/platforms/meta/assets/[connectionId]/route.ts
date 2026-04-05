import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * עדכון בחירת נכסים
 * PATCH /api/platforms/meta/assets/[connectionId]
 * body: { selections: { [assetId]: boolean } }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { connectionId } = await params;
  const body = await req.json();
  const selections = body.selections as Record<string, boolean>;

  if (!selections) {
    return NextResponse.json({ error: "חסרים נתונים" }, { status: 400 });
  }

  // וידוא שהחיבור קיים
  const conn = await prisma.platformConnection.findUnique({ where: { id: connectionId } });
  if (!conn) {
    return NextResponse.json({ error: "חיבור לא נמצא" }, { status: 404 });
  }

  for (const [assetId, isSelected] of Object.entries(selections)) {
    await prisma.platformAsset.updateMany({
      where: { id: assetId, connectionId },
      data: { isSelected },
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET רשימת נכסים של חיבור
 */
export async function GET(_req: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { connectionId } = await params;

  const assets = await prisma.platformAsset.findMany({
    where: { connectionId },
    orderBy: [{ assetType: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(
    assets.map((a) => ({
      id: a.id,
      assetType: a.assetType,
      externalId: a.externalId,
      name: a.name,
      isSelected: a.isSelected,
      extraData: JSON.parse(a.extraData ?? "{}"),
    }))
  );
}
