import { NextResponse, after } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

  // סנכרון יומי (cron): תשובה מיידית + סנכרון ברקע
  if (isCron) {
    after(async () => {
      try { await syncClientTikTok(clientId, daysBack); }
      catch (err) { console.error(`[cron tiktok sync ${clientId}] failed:`, err instanceof Error ? err.message : err); }
    });
    return NextResponse.json({ ok: true, queued: true });
  }

  try {
    const stats = await syncClientTikTok(clientId, daysBack);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
