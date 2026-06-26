import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePortalClient } from "@/lib/auth/portal";
import { sanitizeRange } from "@/lib/dashboard/dto";
import { loadClientCtx } from "@/lib/dashboard/engine";
import { answerDashboardQuestion } from "@/lib/dashboard/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST /api/client-portal/ask — AI שיחתי על המספרים של הלקוח המחובר */
export async function POST(req: Request) {
  const r = await requirePortalClient();
  if (r instanceof NextResponse) return r;

  const ctx = await loadClientCtx(r.clientId);
  const client = await prisma.client.findUnique({ where: { id: r.clientId }, select: { name: true } });
  if (!ctx || !client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const question = (typeof body.question === "string" ? body.question : "").trim().slice(0, 500);
  if (!question) return NextResponse.json({ error: "חסרה שאלה" }, { status: 400 });

  const range = sanitizeRange(typeof body.since === "string" ? body.since : null, typeof body.until === "string" ? body.until : null);
  try {
    const answer = await answerDashboardQuestion(ctx, range, client.name, question);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[Portal ask]", err);
    return NextResponse.json({ error: "שגיאה בניתוח" }, { status: 500 });
  }
}
