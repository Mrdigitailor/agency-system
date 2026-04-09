import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireRole(["admin", "manager"]);
  if (result instanceof NextResponse) return result;

  const items = await prisma.supplier.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const result = await requireRole(["admin", "manager"]);
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const item = await prisma.supplier.create({
    data: {
      name: body.name, type: body.type ?? "", field: body.field ?? "",
      phone: body.phone ?? "", role: body.role ?? "",
      company: body.company ?? "", email: body.email ?? "", notes: body.notes ?? "",
    },
  });
  return NextResponse.json(item, { status: 201 });
}
