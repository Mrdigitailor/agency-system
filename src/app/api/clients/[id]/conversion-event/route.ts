import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * PATCH /api/clients/[id]/conversion-event
 * body: { eventType: string }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  const body = await req.json();
  const eventType: string = body.eventType ?? "";

  await prisma.client.update({
    where: { id },
    data: { metaConversionEvent: eventType },
  });

  return NextResponse.json({ ok: true });
}
