import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * PATCH /api/clients/[id]/google-conversion-action
 * body: { action: string } — JSON array של שמות conversion actions
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  const body = await req.json();
  const action: string = body.action ?? "";

  await prisma.client.update({
    where: { id },
    data: { googleConversionAction: action },
  });

  return NextResponse.json({ ok: true });
}
