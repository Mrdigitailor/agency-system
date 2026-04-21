import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (body.interestedServices) body.interestedServices = JSON.stringify(body.interestedServices);
  const lead = await prisma.lead.update({
    where: { id },
    data: body,
    include: { calls: true },
  });
  return NextResponse.json({ ...lead, interestedServices: JSON.parse(lead.interestedServices) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // מחק שיחות קשורות
  await prisma.leadCall.deleteMany({ where: { leadId: id } });
  // מחק את הליד
  await prisma.lead.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
