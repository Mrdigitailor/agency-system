import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/** PATCH — שינוי שם דוח */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId, reportId } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

  const report = await prisma.clientReport.updateMany({ where: { id: reportId, clientId }, data });
  if (report.count === 0) return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE — מחיקת דוח + הווידג'טים שלו */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId, reportId } = await params;

  const report = await prisma.clientReport.findFirst({ where: { id: reportId, clientId }, select: { id: true } });
  if (!report) return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });

  await prisma.$transaction([
    prisma.dashboardWidget.deleteMany({ where: { reportId } }),
    prisma.clientReport.delete({ where: { id: reportId } }),
  ]);
  return NextResponse.json({ ok: true });
}
