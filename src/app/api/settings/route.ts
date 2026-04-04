import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireRole(["admin"]);
  if (result instanceof NextResponse) return result;

  let settings = await prisma.agencySettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.agencySettings.create({ data: { id: "default" } });
  }
  return NextResponse.json(settings);
}

export async function PATCH(req: Request) {
  const result = await requireRole(["admin"]);
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const settings = await prisma.agencySettings.upsert({
    where: { id: "default" },
    update: body,
    create: { id: "default", ...body },
  });
  return NextResponse.json(settings);
}
