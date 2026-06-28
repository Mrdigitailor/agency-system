import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { loadClientCtx } from "@/lib/dashboard/engine";
import { buildDashboardDTO, sanitizeRange } from "@/lib/dashboard/dto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/clients/[id]/dashboard-preview?since=&until=
 * תצוגה מקדימה (admin) — אותו engine/DTO כמו ה-route הציבורי, כדי ש-preview==ציבורי.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ctx = await loadClientCtx(id);
  if (!ctx) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  const url = new URL(req.url);
  const range = sanitizeRange(url.searchParams.get("since"), url.searchParams.get("until"));
  const reportId = url.searchParams.get("reportId");

  const dto = await buildDashboardDTO({ name: client?.name ?? "", ...ctx }, range, new Date().toISOString(), reportId);
  return NextResponse.json(dto);
}
