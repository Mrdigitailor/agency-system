import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

// שליפת כל הצ׳אטים עם הודעה אחרונה וספירת לא נקראו
export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const rooms = await prisma.chatRoom.findMany({
    include: {
      client: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, content: true, authorName: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ספירת הודעות לא נקראו לכל חדר
  const roomsWithUnread = await Promise.all(
    rooms.map(async (room) => {
      const totalMessages = await prisma.chatMessage.count({ where: { roomId: room.id } });
      const readMessages = await prisma.chatMessageRead.count({
        where: { message: { roomId: room.id }, userId: user.id },
      });
      return {
        id: room.id,
        name: room.name || room.client?.name || "צ׳אט",
        clientId: room.clientId,
        clientName: room.client?.name ?? null,
        lastMessage: room.messages[0] ?? null,
        unreadCount: totalMessages - readMessages,
        createdAt: room.createdAt,
      };
    })
  );

  return NextResponse.json(roomsWithUnread);
}

// יצירת צ׳אט חדש
export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const body = await req.json();

  // אם זה צ׳אט ללקוח — בדוק שלא קיים כבר
  if (body.clientId) {
    const existing = await prisma.chatRoom.findUnique({ where: { clientId: body.clientId } });
    if (existing) return NextResponse.json(existing);
  }

  const room = await prisma.chatRoom.create({
    data: {
      name: body.name ?? "",
      clientId: body.clientId ?? null,
    },
  });

  return NextResponse.json(room, { status: 201 });
}
