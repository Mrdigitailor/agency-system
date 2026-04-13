import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { notifyTaskAssigned } from "@/lib/notifications/task-notify";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const { id } = await params;
  const body = await req.json();

  // שמור את ה-assigneeId הישן לפני עדכון
  const oldTask = await prisma.task.findUnique({
    where: { id },
    select: { assigneeId: true, assignee: true },
  });

  // אם מעדכנים assignee — מצא assigneeId
  if (body.assignee !== undefined && !body.assigneeId) {
    if (body.assignee) {
      const found = await prisma.user.findFirst({
        where: { name: body.assignee, isActive: true },
        select: { id: true },
      });
      body.assigneeId = found?.id ?? null;
    } else {
      body.assigneeId = null;
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: body,
    include: { notes: true },
  });

  // אם השתנה assigneeId — שלח התראה לעובד החדש
  const newAssigneeId = task.assigneeId;
  const oldAssigneeId = oldTask?.assigneeId;
  if (newAssigneeId && newAssigneeId !== oldAssigneeId) {
    notifyTaskAssigned({
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description,
      taskDueDate: task.dueDate,
      taskPriority: task.priority,
      clientId: task.clientId,
      assigneeId: newAssigneeId,
      creatorId: user.id,
      creatorName: user.name,
    }).catch((err) => console.error("[Tasks API] Reassign notification failed:", err));
  }

  return NextResponse.json(task);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
