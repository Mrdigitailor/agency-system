import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const alerts = await prisma.alert.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(alerts);
}

export async function POST(req: Request) {
  const body = await req.json();
  const alert = await prisma.alert.create({
    data: {
      type: body.type,
      title: body.title,
      message: body.message,
      clientId: body.clientId || null,
    },
  });
  return NextResponse.json(alert, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (body.id) {
    await prisma.alert.update({ where: { id: body.id }, data: { isRead: true } });
  }
  return NextResponse.json({ ok: true });
}
