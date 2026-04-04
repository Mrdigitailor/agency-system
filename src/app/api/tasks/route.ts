import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    include: { notes: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description ?? "",
      clientId: body.clientId || null,
      assignee: body.assignee ?? "",
      priority: body.priority ?? "medium",
      dueDate: body.dueDate ?? "",
      status: body.status ?? "pending",
      taskType: body.taskType ?? "other",
      platform: body.platform ?? "",
    },
    include: { notes: true },
  });
  return NextResponse.json(task, { status: 201 });
}
