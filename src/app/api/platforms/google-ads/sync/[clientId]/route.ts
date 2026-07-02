import { NextResponse, after } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/platforms/google-ads/sync/[clientId]
 * Auth: session או CRON_SECRET (ל-backfill).
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = Boolean(secret && provided === secret);
  if (!isCron) {
    const result = await requireAuth();
    if (result instanceof NextResponse) return result;
  }

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const daysBack = body.daysBack ?? 30;

  // סנכרון יומי (cron): תשובה מיידית + סנכרון ברקע, כדי שה-dispatcher לא יקטע בקשות באוויר
  if (isCron) {
    after(async () => {
      try { await syncClientGoogleAds(clientId, daysBack); }
      catch (err) { console.error(`[cron google sync ${clientId}] failed:`, err instanceof Error ? err.message : err); }
    });
    return NextResponse.json({ ok: true, queued: true });
  }

  try {
    const stats = await syncClientGoogleAds(clientId, daysBack);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
