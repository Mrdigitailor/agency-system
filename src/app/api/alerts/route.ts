import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  // התראות של המשתמש או של כולם (userId=null) — לקוח רואה רק את שלו
  const alerts = await prisma.alert.findMany({
    where: user.role === "client" ? { userId: user.id } : { OR: [{ userId: user.id }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(alerts);
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const body = await req.json();
  const alert = await prisma.alert.create({
    data: {
      type: body.type,
      title: body.title,
      message: body.message,
      link: body.link ?? "",
      clientId: body.clientId || null,
      userId: body.userId || null,
    },
  });
  return NextResponse.json(alert, { status: 201 });
}

export async function PATCH(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const body = await req.json();

  if (body.markAllRead) {
    // סמן הכל כנקרא
    await prisma.alert.updateMany({
      where: { OR: [{ userId: user.id }, { userId: null }], isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    await prisma.alert.update({ where: { id: body.id }, data: { isRead: true } });
  }
  return NextResponse.json({ ok: true });
}
