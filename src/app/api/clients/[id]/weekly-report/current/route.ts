import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { getLastWeekRange } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

/**
 * GET /api/clients/[id]/weekly-report/current
 * מחזיר את טיוטת/דוח השבוע האחרון (ראשון–שבת) + הודעות הצ'אט שלו.
 * השבוע מחושב בשרת כדי להימנע מהפרשי אזור-זמן בצד הלקוח.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId } = await params;
  const { start, end } = getLastWeekRange();
  const weekStart = start.toISOString().split("T")[0];
  const weekEnd = end.toISOString().split("T")[0];

  const report = await prisma.weeklyReport.findUnique({
    where: { clientId_weekStart: { clientId, weekStart } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({
    weekStart,
    weekEnd,
    report: report ?? null,
    messages: report?.messages ?? [],
  });
}
