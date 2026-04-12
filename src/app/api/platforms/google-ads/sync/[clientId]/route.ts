import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";

/**
 * POST /api/platforms/google-ads/sync/[clientId]
 */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const daysBack = body.daysBack ?? 30;

  try {
    const stats = await syncClientGoogleAds(clientId, daysBack);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
