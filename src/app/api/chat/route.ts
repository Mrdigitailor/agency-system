import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

// שליפת הצ׳אטים של המשתמש המחובר
export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  // רק חדרים שהמשתמש הוא משתתף בהם
  const rooms = await prisma.chatRoom.findMany({
    where: { participants: { some: { userId: user.id } } },
    include: {
      client: { select: { id: true, name: true } },
      participants: {
        include: { user: { select: { id: true, name: true, role: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, content: true, authorName: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

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
        participants: room.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          role: p.user.role,
        })),
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
  const user = result as AuthUser;

  const body = await req.json();
  const participantIds: string[] = body.participantIds ?? [];

  // היוצר תמיד משתתף
  if (!participantIds.includes(user.id)) participantIds.push(user.id);

  // אם זה צ׳אט ללקוח — בדוק שלא קיים כבר
  if (body.clientId) {
    const existing = await prisma.chatRoom.findUnique({
      where: { clientId: body.clientId },
      include: { participants: true },
    });
    if (existing) {
      // הוסף משתתפים חדשים
      const existingIds = new Set(existing.participants.map((p) => p.userId));
      const toAdd = participantIds.filter((id) => !existingIds.has(id));
      if (toAdd.length > 0) {
        await prisma.chatParticipant.createMany({
          data: toAdd.map((userId) => ({ roomId: existing.id, userId })),
          skipDuplicates: true,
        });
      }
      return NextResponse.json(existing);
    }
  }

  const room = await prisma.chatRoom.create({
    data: {
      name: body.name ?? "",
      clientId: body.clientId ?? null,
      participants: {
        create: participantIds.map((userId) => ({ userId })),
      },
    },
  });

  return NextResponse.json(room, { status: 201 });
}
