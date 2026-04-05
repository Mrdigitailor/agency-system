import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

// עדכון בחירת נכסים (isSelected)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; platform: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const { id: clientId, platform } = await params;
  const body = await req.json();

  // body: { selections: { [assetId]: boolean } }
  const selections = body.selections as Record<string, boolean>;
  if (!selections) {
    return NextResponse.json({ error: "חסרים נתונים" }, { status: 400 });
  }

  const connection = await prisma.platformConnection.findUnique({
    where: { clientId_platform: { clientId, platform } },
  });
  if (!connection) {
    return NextResponse.json({ error: "חיבור לא נמצא" }, { status: 404 });
  }

  // עדכון לכל נכס
  for (const [assetId, isSelected] of Object.entries(selections)) {
    await prisma.platformAsset.updateMany({
      where: { id: assetId, connectionId: connection.id },
      data: { isSelected },
    });
  }

  return NextResponse.json({ ok: true });
}
