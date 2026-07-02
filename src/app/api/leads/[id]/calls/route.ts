import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

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
