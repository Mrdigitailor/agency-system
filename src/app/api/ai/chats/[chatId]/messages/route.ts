import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

// GET — הודעות שיחה
export async function GET(_req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { chatId } = await params;
  const messages = await prisma.aiChatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(messages);
}
