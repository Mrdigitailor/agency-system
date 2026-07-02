import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { detectClientIssues } from "@/lib/performance/detect";
import { diagnoseClient, createTasksFromDiagnosis } from "@/lib/performance/diagnose";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/clients/[id]/diagnose — אבחון ידני של לקוח בודד ("אבחן עכשיו").
 * Auth: session או CRON_SECRET.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!(secret && provided === secret)) {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, monthlyBudget: true, targetCostPerConversion: true, deletedAt: true },
  });
  if (!client || client.deletedAt) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  const det = await detectClientIssues(client);
  if (!det) return NextResponse.json({ ok: true, flagged: false, message: "לא זוהתה ירידת ביצועים משמעותית בשבוע האחרון." });

  const diag = await diagnoseClient(det);
  if (!diag) return NextResponse.json({ ok: false, error: "האבחון נכשל. נסה שוב." }, { status: 500 });

  const tasksCreated = await createTasksFromDiagnosis(det, diag).catch(() => 0);
  return NextResponse.json({ ok: true, flagged: true, score: det.score, signals: det.signals, diagnosis: diag, tasksCreated });
}
