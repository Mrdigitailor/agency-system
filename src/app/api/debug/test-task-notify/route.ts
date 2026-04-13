import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { notifyTaskAssigned } from "@/lib/notifications/task-notify";

/**
 * GET /api/debug/test-task-notify
 * מדמה יצירת משימה ושליחת התראה + מייל — בלי ליצור משימה בפועל
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const user = auth as AuthUser;

  const log: string[] = [];
  const out = (msg: string) => { console.log(`[DEBUG TaskNotify] ${msg}`); log.push(msg); };

  out(`=== Test Task Notification ===`);
  out(`Current user: ${user.name} (${user.id}) role=${user.role}`);

  // מצא עובד אחר (לא את המשתמש הנוכחי)
  const otherUser = await prisma.user.findFirst({
    where: { id: { not: user.id }, isActive: true },
    select: { id: true, name: true, email: true },
  });

  if (!otherUser) {
    out(`❌ No other user found — cannot test (need at least 2 users)`);
    return NextResponse.json({ log, error: "no_other_user" });
  }

  out(`Target user: ${otherUser.name} (${otherUser.id}) email=${otherUser.email}`);

  if (!otherUser.email) {
    out(`❌ Target user has no email`);
    return NextResponse.json({ log, error: "no_email" });
  }

  // מצא לקוח כלשהו
  const client = await prisma.client.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  out(`Client: ${client ? `${client.name} (${client.id})` : "none"}`);

  // הרץ את notifyTaskAssigned
  out(`\nCalling notifyTaskAssigned...`);
  try {
    await notifyTaskAssigned({
      taskId: "test-task-id",
      taskTitle: "משימת בדיקה — טסט מייל",
      taskDescription: "זו משימת בדיקה לבדיקת שליחת מייל",
      taskDueDate: new Date().toISOString().split("T")[0],
      taskPriority: "high",
      clientId: client?.id ?? null,
      assigneeId: otherUser.id,
      creatorId: user.id,
      creatorName: user.name,
    });
    out(`✅ notifyTaskAssigned completed without error`);
  } catch (err) {
    out(`❌ notifyTaskAssigned THREW: ${err instanceof Error ? err.message : String(err)}`);
  }

  // בדוק אם נוצרה התראה
  const alert = await prisma.alert.findFirst({
    where: { userId: otherUser.id, type: "new_task" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true },
  });

  if (alert) {
    out(`\n✅ Alert found: "${alert.title}" (${alert.createdAt.toISOString()})`);
  } else {
    out(`\n❌ No alert found for user ${otherUser.id}`);
  }

  out(`\nCheck Vercel function logs for [TaskNotify] entries for full detail.`);

  return NextResponse.json({
    log,
    targetUser: { name: otherUser.name, email: otherUser.email },
    currentUser: { name: user.name, id: user.id },
  });
}
