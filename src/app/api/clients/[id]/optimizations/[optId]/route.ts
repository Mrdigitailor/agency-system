import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; optId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { optId } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.actualResult !== undefined) data.actualResult = body.actualResult;
  if (body.isChecked !== undefined) {
    data.isChecked = body.isChecked;
    data.checkedAt = body.isChecked ? new Date() : null;
  }
  if (body.actionTaken !== undefined) data.actionTaken = body.actionTaken;
  if (body.expectedOutcome !== undefined) data.expectedOutcome = body.expectedOutcome;
  if (body.platform !== undefined) data.platform = body.platform;
  if (body.campaignIds !== undefined) data.campaignIds = JSON.stringify(body.campaignIds);
  if (body.date !== undefined) data.date = body.date;

  const updated = await prisma.optimization.update({
    where: { id: optId },
    data,
  });

  return NextResponse.json({
    ...updated,
    campaignIds: JSON.parse(updated.campaignIds || "[]"),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; optId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { optId } = await params;
  await prisma.optimization.delete({ where: { id: optId } });
  return NextResponse.json({ ok: true });
}
