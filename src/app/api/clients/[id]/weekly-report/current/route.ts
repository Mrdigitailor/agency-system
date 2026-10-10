import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { getWeekRangeBack } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

/**
 * GET /api/clients/[id]/weekly-report/current?offset=N
 * מחזיר את דוח השבוע + הודעות הצ'אט שלו. offset: 0=שבוע אחרון שהסתיים,
 * חיובי=שבועות אחורה, -1=השבוע הנוכחי (בתהליך). השבוע מחושב בשרת.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId } = await params;
  const offsetRaw = parseInt(new URL(req.url).searchParams.get("offset") ?? "0", 10);
  // -1 = השבוע הנוכחי (בתהליך), 0 = שבוע אחרון שהסתיים, עד 12 שבועות אחורה
  const offset = Number.isFinite(offsetRaw) ? Math.min(12, Math.max(-1, offsetRaw)) : 0;
  const { start, end } = getWeekRangeBack(offset);
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
