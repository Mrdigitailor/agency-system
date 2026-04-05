import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

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
 * PATCH — עדכון tracker של לקוח
 * body: { clientId, type: "weekly"|"monthly", date: "YYYY-MM-DD" }
 */
export async function PATCH(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  if (!body.clientId || !body.type) {
    return NextResponse.json({ error: "חסרים נתונים" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const date = body.date ?? today;

  const updateData: Record<string, string> = {};
  if (body.type === "weekly") updateData.weeklyLastSent = date;
  else if (body.type === "monthly") updateData.monthlyLastSent = date;
  else return NextResponse.json({ error: "סוג דוח לא תקין" }, { status: 400 });

  const tracker = await prisma.reportTracker.upsert({
    where: { clientId: body.clientId },
    update: updateData,
    create: {
      clientId: body.clientId,
      weeklyLastSent: body.type === "weekly" ? date : "",
      monthlyLastSent: body.type === "monthly" ? date : "",
    },
  });

  return NextResponse.json(tracker);
}
