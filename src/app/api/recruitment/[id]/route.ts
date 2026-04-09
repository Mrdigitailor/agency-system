import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["admin"]);
  if (result instanceof NextResponse) return result;
  const { id } = await params;
  const body = await req.json();
  const item = await prisma.recruitment.update({ where: { id }, data: body });
  return NextResponse.json(item);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["admin"]);
  if (result instanceof NextResponse) return result;
  const { id } = await params;
  await prisma.recruitment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
