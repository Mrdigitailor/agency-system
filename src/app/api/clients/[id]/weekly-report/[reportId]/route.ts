import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { stripLongDashes } from "@/lib/reports/generate";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/clients/[id]/weekly-report/[reportId]
 * עריכה ידנית של תוכן הדוח (טקסטים/מספרים) — שמירה ישירה, בלי AI.
 * body: { content: string }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId, reportId } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const content = typeof body.content === "string" ? body.content : null;
  if (content === null) return NextResponse.json({ error: "חסר תוכן" }, { status: 400 });

  const report = await prisma.weeklyReport.findUnique({ where: { id: reportId }, select: { clientId: true } });
  if (!report || report.clientId !== clientId) {
    return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });
  }

  // מסירים מקפים ארוכים גם בעריכה ידנית — עקבי עם הפקה/refine
  const clean = stripLongDashes(content.trim());
  const updated = await prisma.weeklyReport.update({ where: { id: reportId }, data: { content: clean } });
  return NextResponse.json({ ok: true, content: updated.content });
}
