import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireRole(["admin"]);
  if (result instanceof NextResponse) return result;

  const items = await prisma.recruitment.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const result = await requireRole(["admin"]);
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const item = await prisma.recruitment.create({
    data: {
      name: body.name, email: body.email ?? "", phone: body.phone ?? "",
      experience: body.experience ?? "", notes: body.notes ?? "",
      cvUrl: body.cvUrl ?? "", stage: body.stage ?? "submitted", position: body.position ?? "",
    },
  });
  return NextResponse.json(item, { status: 201 });
}
