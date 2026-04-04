import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const note = await prisma.taskNote.create({
    data: {
      taskId: id,
      authorName: body.author ?? "",
      content: body.content,
    },
  });
  return NextResponse.json(note, { status: 201 });
}
