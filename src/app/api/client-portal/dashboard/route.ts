import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePortalClient } from "@/lib/auth/portal";
import { buildDashboardDTO, sanitizeRange } from "@/lib/dashboard/dto";
import { loadClientCtx } from "@/lib/dashboard/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/client-portal/dashboard — הדשבורד החי של הלקוח המחובר */
export async function GET(req: Request) {
  const r = await requirePortalClient();
  if (r instanceof NextResponse) return r;

  const ctx = await loadClientCtx(r.clientId);
  const client = await prisma.client.findUnique({ where: { id: r.clientId }, select: { name: true } });
  if (!ctx || !client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const range = sanitizeRange(searchParams.get("since"), searchParams.get("until"));

  const dto = await buildDashboardDTO({ name: client.name, ...ctx }, range, new Date().toISOString());
  return NextResponse.json(dto);
}
