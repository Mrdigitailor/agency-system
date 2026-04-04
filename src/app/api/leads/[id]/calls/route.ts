import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const call = await prisma.leadCall.create({
    data: {
      leadId: id,
      date: body.date,
      summary: body.summary,
      callerName: body.caller ?? "",
    },
  });
  return NextResponse.json(call, { status: 201 });
}
