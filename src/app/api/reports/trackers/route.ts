import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { getLastWeekRange } from "@/lib/utils/dates";

/**
 * GET — רשימת trackers של כל הלקוחות
 */
export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const trackers = await prisma.reportTracker.findMany();
  return NextResponse.json(trackers);
}

/**
 * PATCH — עדכון tracker של לקוח + יצירת רשומת WeeklyReport
 * body: { clientId, type: "weekly"|"monthly", date?, content?, author? }
 */
export async function PATCH(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const body = await req.json();
  if (!body.clientId || !body.type) {
    return NextResponse.json({ error: "חסרים נתונים" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const date = body.date ?? today;
  const content = body.content ?? "";
  const author = body.author ?? user.name;

  if (body.type !== "weekly" && body.type !== "monthly") {
    return NextResponse.json({ error: "סוג דוח לא תקין" }, { status: 400 });
  }

  const isWeekly = body.type === "weekly";

  const tracker = await prisma.reportTracker.upsert({
    where: { clientId: body.clientId },
    update: isWeekly
      ? { weeklyLastSent: date, weeklyContent: content, weeklyAuthor: author }
      : { monthlyLastSent: date, monthlyContent: content, monthlyAuthor: author },
    create: {
      clientId: body.clientId,
      weeklyLastSent: isWeekly ? date : "",
      monthlyLastSent: isWeekly ? "" : date,
      weeklyContent: isWeekly ? content : "",
      weeklyAuthor: isWeekly ? author : "",
      monthlyContent: isWeekly ? "" : content,
      monthlyAuthor: isWeekly ? "" : author,
    },
  });

  // יצירת/עדכון רשומת WeeklyReport עם היסטוריה מלאה
  if (isWeekly) {
    const { start, end } = getLastWeekRange();
    const weekStart = start.toISOString().split("T")[0];
    const weekEnd = end.toISOString().split("T")[0];

    await prisma.weeklyReport.upsert({
      where: { clientId_weekStart: { clientId: body.clientId, weekStart } },
      update: {
        content,
        campaignManagerName: author,
        campaignManagerId: user.id ?? "",
        updatedAt: new Date(),
      },
      create: {
        clientId: body.clientId,
        campaignManagerId: user.id ?? "",
        campaignManagerName: author,
        weekStart,
        weekEnd,
        content,
        sentAt: new Date(),
      },
    });
  }

  return NextResponse.json(tracker);
}
