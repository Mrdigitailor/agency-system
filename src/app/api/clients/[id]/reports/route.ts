import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/** GET /api/clients/[id]/reports — רשימת הדוחות של הלקוח */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;

  const reports = await prisma.clientReport.findMany({
    where: { clientId },
    orderBy: { sortOrder: "asc" },
  });
  // ספירת ווידג'טים לכל דוח
  const counts = await prisma.dashboardWidget.groupBy({ by: ["reportId"], where: { clientId }, _count: true });
  const countBy = new Map(counts.map((c) => [c.reportId, c._count]));

  return NextResponse.json(reports.map((r) => ({ ...r, widgetCount: countBy.get(r.id) ?? 0 })));
}

/** POST /api/clients/[id]/reports — דוח חדש */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const count = await prisma.clientReport.count({ where: { clientId } });
  const report = await prisma.clientReport.create({
    data: { clientId, name: (typeof body.name === "string" && body.name.trim()) || "דוח חדש", sortOrder: count },
  });
  return NextResponse.json({ ...report, widgetCount: 0 }, { status: 201 });
}
