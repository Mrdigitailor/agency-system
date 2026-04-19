import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const { id } = await params;
  const body = await req.json();
  const note = await prisma.taskNote.create({
    data: {
      taskId: id,
      authorId: user.id,
      authorName: user.name, // שם מה-session, לא מה-body
      content: body.content,
    },
  });
  return NextResponse.json(note, { status: 201 });
}
