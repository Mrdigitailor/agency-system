import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getLastWeekRange } from "@/lib/utils/dates";

// Dispatcher בלבד — ממתין להפקות שרצות במקביל כ-invocations נפרדים
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-reports
 * רץ ביום ראשון — מפיק טיוטת דוח שבועי לכל לקוח פעיל על השבוע שחלף.
 * Fan-out: כל הפקה היא קריאת HTTP נפרדת (invocation משלה) שרצה במקביל.
 * אידמפוטנטי: ה-generate מדלג על טיוטה קיימת.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { start, end } = getLastWeekRange();
  const weekStart = start.toISOString().split("T")[0];
  const weekEnd = end.toISOString().split("T")[0];

  // לקוחות פעילים עם לפחות חיבור פלטפורמה אחד פעיל
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      status: { not: "inactive" },
      platformConnections: { some: { isActive: true } },
    },
    select: { id: true, name: true },
  });

  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;

  const results = await Promise.allSettled(
    clients.map((c) =>
      fetch(`${origin}/api/clients/${c.id}/weekly-report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${expected ?? ""}` },
        body: JSON.stringify({ weekStart, weekEnd }),
      }).then((r) => r.ok),
    ),
  );

  const generated = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
  console.log(`[Cron weekly-reports] week ${weekStart}..${weekEnd} | clients=${clients.length} | generated=${generated}`);

  return NextResponse.json({ ok: true, weekStart, weekEnd, clients: clients.length, generated });
}
