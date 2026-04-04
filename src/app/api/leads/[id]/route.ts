import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

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
