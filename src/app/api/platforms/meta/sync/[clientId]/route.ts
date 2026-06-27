import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientMeta } from "@/lib/api/meta/sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * סנכרון לקוח בודד — Auth: session או CRON_SECRET (לסנכרון יומי).
 * POST /api/platforms/meta/sync/[clientId]  body: { daysBack? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace("Bearer ", "") ?? new URL(req.url).searchParams.get("secret");
  if (!(secret && provided === secret)) {
    const result = await requireAuth();
    if (result instanceof NextResponse) return result;
  }

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const daysBack = body.daysBack ?? 30;

  const startTime = Date.now();
  try {
    const forceAll = body.forceAll ?? true; // manual sync = always force
    const stats = await syncClientMeta(clientId, daysBack, forceAll);
    const durationMs = Date.now() - startTime;
    return NextResponse.json({ ...stats, durationMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
