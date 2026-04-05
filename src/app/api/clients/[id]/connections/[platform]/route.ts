import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

// ניתוק חיבור
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; platform: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const { id: clientId, platform } = await params;

  await prisma.platformConnection.updateMany({
    where: { clientId, platform },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
