import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { loadClientCtx, listConversionActions } from "@/lib/dashboard/engine";
import { sanitizeRange } from "@/lib/dashboard/dto";
import type { Platform } from "@/lib/dashboard/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/clients/[id]/action-types?since&until&platform&campaignFilter
 * מחזיר את כל סוגי ההמרות הזמינים ללקוח בטווח — לבורר "לפי סוג המרה" בעורך.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;

  const ctx = await loadClientCtx(clientId);
  if (!ctx) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  const url = new URL(req.url);
  const range = sanitizeRange(url.searchParams.get("since"), url.searchParams.get("until"));
  const platform = (url.searchParams.get("platform") || "all") as Platform;
  const campaignFilter = url.searchParams.get("campaignFilter") || undefined;

  const actions = await listConversionActions(ctx, range, { platform, campaignFilter });
  return NextResponse.json(actions);
}
