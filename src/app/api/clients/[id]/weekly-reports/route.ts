import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET — היסטוריית דוחות שבועיים של לקוח
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id } = await params;

  const reports = await prisma.weeklyReport.findMany({
    where: { clientId: id },
    orderBy: { weekStart: "desc" },
    take: 52, // עד שנה אחורה
  });

  return NextResponse.json(reports);
}

/**
 * PATCH — עדכון תוכן דוח שבועי בדיעבד
 * body: { reportId, content }
 */
export async function PATCH(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  if (!body.reportId || !body.content) {
    return NextResponse.json({ error: "חסרים נתונים" }, { status: 400 });
  }

  const report = await prisma.weeklyReport.update({
    where: { id: body.reportId },
    data: { content: body.content },
  });

  return NextResponse.json(report);
}
