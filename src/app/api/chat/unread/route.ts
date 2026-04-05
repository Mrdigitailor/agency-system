import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  // רק מחדרים שהמשתמש משתתף בהם
  const totalMessages = await prisma.chatMessage.count({
    where: { room: { participants: { some: { userId: user.id } } } },
  });
  const readMessages = await prisma.chatMessageRead.count({
    where: { userId: user.id },
  });

  return NextResponse.json({ unread: totalMessages - readMessages });
}
