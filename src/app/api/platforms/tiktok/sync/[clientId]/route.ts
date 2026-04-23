import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const stats = await syncClientTikTok(clientId, body.daysBack ?? 30);
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
