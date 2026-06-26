import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePortalClient } from "@/lib/auth/portal";

export const dynamic = "force-dynamic";

/** מבטיח שקיים חדר צ'אט ללקוח, עם הלקוח + צד הסוכנות כמשתתפים */
async function ensureRoom(clientId: string, clientUserId: string): Promise<string> {
  let room = await prisma.chatRoom.findUnique({ where: { clientId }, select: { id: true } });
  if (!room) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, campaignManagerId: true } });
    room = await prisma.chatRoom.create({ data: { name: client?.name ?? "צ'אט לקוח", clientId }, select: { id: true } });

    // צרף את צד הסוכנות — מנהל הקמפיינים + אדמינים — כדי שיראו ויענו ב-/chat
    const agencyIds = new Set<string>();
    if (client?.campaignManagerId) agencyIds.add(client.campaignManagerId);
    const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } });
    for (const a of admins) agencyIds.add(a.id);
    for (const uid of agencyIds) {
      await prisma.chatParticipant.upsert({ where: { roomId_userId: { roomId: room.id, userId: uid } }, update: {}, create: { roomId: room.id, userId: uid } });
    }
  }
  // הלקוח כמשתתף
  await prisma.chatParticipant.upsert({ where: { roomId_userId: { roomId: room.id, userId: clientUserId } }, update: {}, create: { roomId: room.id, userId: clientUserId } });
  return room.id;
}

/** GET — חדר הצ'אט של הלקוח + ההודעות (מסומנות כנקראו) */
export async function GET() {
  const r = await requirePortalClient();
  if (r instanceof NextResponse) return r;

  const roomId = await ensureRoom(r.clientId, r.user.id);
  const messages = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    select: { id: true, content: true, authorName: true, authorId: true, createdAt: true },
  });

  const ids = messages.map((m) => m.id);
  if (ids.length > 0) {
    await prisma.chatMessageRead.createMany({
      data: ids.map((messageId) => ({ messageId, userId: r.user.id })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ roomId, messages });
}

/** POST — שליחת הודעה מהלקוח */
export async function POST(req: Request) {
  const r = await requirePortalClient();
  if (r instanceof NextResponse) return r;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const content = (typeof body.content === "string" ? body.content : "").trim();
  if (!content) return NextResponse.json({ error: "הודעה ריקה" }, { status: 400 });

  const roomId = await ensureRoom(r.clientId, r.user.id);
  const message = await prisma.chatMessage.create({
    data: { roomId, authorId: r.user.id, authorName: r.user.name, content },
  });
  await prisma.chatMessageRead.create({ data: { messageId: message.id, userId: r.user.id } });
  return NextResponse.json(message, { status: 201 });
}
