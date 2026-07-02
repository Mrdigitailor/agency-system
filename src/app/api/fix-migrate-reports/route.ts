import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getWeekRangeForDate } from "@/lib/utils/dates";
import { requireRole } from "@/lib/auth/api-guard";

/**
 * GET /api/fix-migrate-reports
 * מיגרציה חד-פעמית: העברת נתוני ReportTracker → WeeklyReport (admin בלבד; מומלץ למחוק אחרי אישור)
 */
export async function GET() {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const trackers = await prisma.reportTracker.findMany({
    where: { weeklyLastSent: { not: "" } },
  });

  if (trackers.length === 0) {
    return NextResponse.json({ ok: true, message: "אין trackers למיגרציה", created: 0 });
  }

  // שלוף מנהלי קמפיינים לכל הלקוחות
  const employees = await prisma.user.findMany({
    where: { isActive: true, role: "campaignManager" },
    select: { name: true, id: true, assignedClientIds: true },
  });

  function getCmForClient(clientId: string): { name: string; id: string } {
    const emp = employees.find((e) => {
      const ids: string[] = JSON.parse(e.assignedClientIds ?? "[]");
      return ids.includes(clientId);
    });
    return emp ? { name: emp.name, id: emp.id } : { name: "", id: "" };
  }

  let created = 0;
  const errors: string[] = [];

  for (const tracker of trackers) {
    try {
      const { start, end } = getWeekRangeForDate(tracker.weeklyLastSent);
      const weekStart = start.toISOString().split("T")[0];
      const weekEnd = end.toISOString().split("T")[0];
      const cm = getCmForClient(tracker.clientId);

      // בדוק אם כבר קיימת רשומה לשבוע הזה
      const existing = await prisma.weeklyReport.findUnique({
        where: { clientId_weekStart: { clientId: tracker.clientId, weekStart } },
      });

      if (!existing) {
        await prisma.weeklyReport.create({
          data: {
            clientId: tracker.clientId,
            campaignManagerId: cm.id,
            campaignManagerName: tracker.weeklyAuthor || cm.name,
            weekStart,
            weekEnd,
            content: tracker.weeklyContent || "(דוח נשלח — תוכן לא הוזן)",
            sentAt: new Date(tracker.weeklyLastSent),
          },
        });
        created++;
      }
    } catch (err) {
      errors.push(`${tracker.clientId}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    totalTrackers: trackers.length,
    created,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const dynamic = "force-dynamic";
