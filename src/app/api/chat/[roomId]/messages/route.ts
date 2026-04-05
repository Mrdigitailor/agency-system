import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

// שליפת הודעות של חדר
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const { roomId } = await params;

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

  return NextResponse.json(message, { status: 201 });
}
