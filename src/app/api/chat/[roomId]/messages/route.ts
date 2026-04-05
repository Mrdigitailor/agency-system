import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

// שליפת הודעות של חדר
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const { roomId } = await params;

  // בדוק שהמשתמש משתתף בחדר
  const isParticipant = await prisma.chatParticipant.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
  });
  if (!isParticipant) {
    return NextResponse.json({ error: "אין הרשאה לצ׳אט זה" }, { status: 403 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, content: true, authorName: true, authorId: true, createdAt: true,
    },
  });

  // סמן הכל כנקרא
  const messageIds = messages.map((m) => m.id);
  if (messageIds.length > 0) {
    const existingReads = await prisma.chatMessageRead.findMany({
      where: { userId: user.id, messageId: { in: messageIds } },
      select: { messageId: true },
    });
    const readSet = new Set(existingReads.map((r) => r.messageId));
    const toMark = messageIds.filter((id) => !readSet.has(id));

    if (toMark.length > 0) {
      await prisma.chatMessageRead.createMany({
        data: toMark.map((messageId) => ({ messageId, userId: user.id })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json(messages);
}

// שליחת הודעה
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const { roomId } = await params;

  // בדוק שהמשתמש משתתף
  const isParticipant = await prisma.chatParticipant.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
  });
  if (!isParticipant) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await req.json();

  const message = await prisma.chatMessage.create({
    data: {
      roomId,
      authorId: user.id,
      authorName: user.name,
      content: body.content,
    },
  });

  // סמן כנקרא לשולח
  await prisma.chatMessageRead.create({
    data: { messageId: message.id, userId: user.id },
  });

  // יצירת התראות על תיוגים (@name)
  const mentions = (body.content as string).match(/@(\S+)/g);
  if (mentions && mentions.length > 0) {
    const mentionNames = mentions.map((m) => m.substring(1));
    const participants = await prisma.chatParticipant.findMany({
      where: { roomId },
      include: { user: { select: { id: true, name: true } } },
    });

    for (const participant of participants) {
      if (participant.user.id === user.id) continue;
      if (mentionNames.some((n) => participant.user.name.startsWith(n))) {
        await prisma.alert.create({
          data: {
            type: "chat_mention",
            title: `${user.name} תייג אותך בצ׳אט`,
            message: body.content.slice(0, 100),
            link: `/chat?room=${roomId}`,
            userId: participant.user.id,
          },
        });
      }
    }
  }

  return NextResponse.json(message, { status: 201 });
}
