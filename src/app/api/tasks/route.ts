import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { notifyTaskAssigned } from "@/lib/notifications/task-notify";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const where: Record<string, unknown> = { deletedAt: null };
  // לקוח קצה רואה רק משימות של הלקוח/ות שלו
  if (user.role === "client") {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { assignedClientIds: true } });
    const assignedIds: string[] = JSON.parse(dbUser?.assignedClientIds ?? "[]");
    if (assignedIds.length === 0) return NextResponse.json([]);
    where.clientId = { in: assignedIds };
  }

  const tasks = await prisma.task.findMany({
    where,
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

  // לקוח קצה — רשאי ליצור משימות רק ללקוח/ות שלו (מונע זיהום נתונים בין לקוחות)
  if (creator.role === "client") {
    const dbUser = await prisma.user.findUnique({ where: { id: creator.id }, select: { assignedClientIds: true } });
    let assignedIds: string[] = [];
    try { assignedIds = JSON.parse(dbUser?.assignedClientIds ?? "[]"); } catch {}
    if (!body.clientId || !assignedIds.includes(body.clientId)) {
      return NextResponse.json({ error: "אין הרשאה ללקוח זה" }, { status: 403 });
    }
  }

  // חיפוש assigneeId מהשם אם לא סופק
  let assigneeId = body.assigneeId ?? null;
  console.log(`[Tasks POST] Creating task "${body.title}" | assignee="${body.assignee}" | assigneeId=${assigneeId} | creator=${creator.name} (${creator.id})`);

  if (!assigneeId && body.assignee) {
    const user = await prisma.user.findFirst({
      where: { name: body.assignee, isActive: true },
      select: { id: true },
    });
    assigneeId = user?.id ?? null;
    console.log(`[Tasks POST] Resolved assignee name "${body.assignee}" → id=${assigneeId}`);
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
  console.log(`[Tasks POST] Task created: ${task.id} | assigneeId=${assigneeId} | will notify: ${!!assigneeId}`);
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
