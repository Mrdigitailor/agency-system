import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const sources = await prisma.leadSource.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(sources);
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "שם חסר" }, { status: 400 });
  }

  const source = await prisma.leadSource.upsert({
    where: { name: body.name.trim() },
    update: {},
    create: { name: body.name.trim() },
  });

  return NextResponse.json(source, { status: 201 });
}
