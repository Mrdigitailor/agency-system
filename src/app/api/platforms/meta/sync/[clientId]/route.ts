import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientMeta } from "@/lib/api/meta/sync";

/**
 * סנכרון ידני של לקוח בודד
 * POST /api/platforms/meta/sync/[clientId]
 * body: { daysBack?: number } (ברירת מחדל 30)
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const daysBack = body.daysBack ?? 30;

  const startTime = Date.now();
  try {
    const stats = await syncClientMeta(clientId, daysBack);
    const durationMs = Date.now() - startTime;
    return NextResponse.json({ ...stats, durationMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
