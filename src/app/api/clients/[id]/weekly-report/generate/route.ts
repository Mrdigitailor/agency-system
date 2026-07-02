import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { generateAndSaveWeeklyReport } from "@/lib/reports/generate";
import { getLastWeekRange } from "@/lib/utils/dates";

// יצירת הדוח כרוכה בקריאת AI — מאריכים את חלון ההרצה
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/clients/[id]/weekly-report/generate
 * Auth: session או CRON_SECRET (לקריאות מה-cron).
 * Body: { weekStart?, weekEnd?, force? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const url = new URL(req.url);

  // אימות — session או סוד ה-cron
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = Boolean(secret && provided === secret);
  if (!isCron) {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const force = body.force === true || url.searchParams.get("force") === "1";

  let weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
  let weekEnd = typeof body.weekEnd === "string" ? body.weekEnd : "";
  if (!weekStart || !weekEnd) {
    const { start, end } = getLastWeekRange();
    weekStart = start.toISOString().split("T")[0];
    weekEnd = end.toISOString().split("T")[0];
  }

  try {
    const report = await generateAndSaveWeeklyReport(clientId, weekStart, weekEnd, force);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[WeeklyReport generate]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
