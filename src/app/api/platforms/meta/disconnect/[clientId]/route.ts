import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * ניתוק חיבור Meta של לקוח
 * DELETE /api/platforms/meta/disconnect/[clientId]
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  // סימון כלא פעיל (שומר היסטוריה)
  await prisma.platformConnection.updateMany({
    where: { clientId, platform: "meta" },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
