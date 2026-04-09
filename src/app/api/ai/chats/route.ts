import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

// GET — רשימת שיחות AI של משתמש עם לקוח
export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");

  const where: Record<string, unknown> = { userId: user.id };
  if (clientId) where.clientId = clientId;

  const chats = await prisma.aiChat.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return NextResponse.json(chats);
}

// POST — יצירת שיחה חדשה
export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const body = await req.json();
  const chat = await prisma.aiChat.create({
    data: {
      clientId: body.clientId,
      userId: user.id,
      title: body.title ?? "שיחה חדשה",
    },
  });

  return NextResponse.json(chat, { status: 201 });
}
