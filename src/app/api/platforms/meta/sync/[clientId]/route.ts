import { NextResponse, after } from "next/server";
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
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = !!(secret && provided === secret);
  if (!isCron) {
    const result = await requireAuth();
    if (result instanceof NextResponse) return result;
  }

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const daysBack = body.daysBack ?? 30;

  // סנכרון יומי (cron): מחזירים תשובה מיידית ומסנכרנים ברקע, כדי שה-dispatcher
  // לא יקטע בקשות-בנות שעדיין באוויר. כל סנכרון רץ ב-invocation עצמאי עם 60ש' מלאות.
  if (isCron) {
    after(async () => {
      try { await syncClientMeta(clientId, daysBack, body.forceAll ?? true); }
      catch (err) { console.error(`[cron meta sync ${clientId}] failed:`, err instanceof Error ? err.message : err); }
    });
    return NextResponse.json({ ok: true, queued: true });
  }

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
