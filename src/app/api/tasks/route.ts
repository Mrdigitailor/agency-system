import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { notifyTaskAssigned } from "@/lib/notifications/task-notify";

export async function GET() {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null },
    include: { notes: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const creator = result as AuthUser;

  const body = await req.json();

  // חיפוש assigneeId מהשם אם לא סופק
  let assigneeId = body.assigneeId ?? null;
  if (!assigneeId && body.assignee) {
    const user = await prisma.user.findFirst({
      where: { name: body.assignee, isActive: true },
      select: { id: true },
    });
    assigneeId = user?.id ?? null;
  }

  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description ?? "",
      clientId: body.clientId || null,
      assignee: body.assignee ?? "",
      assigneeId,
      creatorId: creator.id,
      priority: body.priority ?? "medium",
      dueDate: body.dueDate ?? "",
      status: body.status ?? "pending",
      taskType: body.taskType ?? "other",
      platform: body.platform ?? "",
    },
    include: { notes: true },
  });

  // התראה + מייל לעובד שקיבל את המשימה (ברקע — לא חוסם)
  if (assigneeId) {
    notifyTaskAssigned({
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description,
      taskDueDate: task.dueDate,
      taskPriority: task.priority,
      clientId: task.clientId,
      assigneeId,
      creatorId: creator.id,
      creatorName: creator.name,
    }).catch((err) => console.error("[Tasks API] Notification failed:", err));
  }

  return NextResponse.json(task, { status: 201 });
}
