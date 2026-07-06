import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { generateWidgetsFromPrompt } from "@/lib/dashboard/widget-from-prompt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/clients/[id]/widgets/from-prompt
 * Body: { prompt, reportId }
 * מתרגם תיאור טקסטואלי לווידג'טים ויוצר אותם בדוח. מחזיר גם מה שלא נתמך.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const reportId = typeof body.reportId === "string" ? body.reportId : null;
  if (!prompt) return NextResponse.json({ error: "חסר תיאור" }, { status: 400 });

  let result;
  try {
    result = await generateWidgetsFromPrompt(prompt);
  } catch {
    return NextResponse.json({ error: "שגיאה ביצירת הווידג'ט — נסה שוב" }, { status: 500 });
  }

  // יוצרים את הווידג'טים התקינים בסוף הדוח
  let created = 0;
  const startOrder = await prisma.dashboardWidget.count({ where: { clientId, ...(reportId ? { reportId } : {}) } });
  for (const w of result.widgets) {
    const filters: Array<{ field: string; operator: string; value: string }> = [];
    if (w.campaignFilter) filters.push({ field: "campaign", operator: "contains", value: w.campaignFilter });
    for (const a of w.excludeActions ?? []) filters.push({ field: "excludeAction", operator: "ne", value: a });
    await prisma.dashboardWidget.create({
      data: {
        clientId,
        reportId,
        sortOrder: startOrder + created,
        platform: w.platform,
        dataLevel: "campaign",
        metrics: JSON.stringify(w.metrics),
        dimension: w.dimension,
        filters: JSON.stringify(filters),
        displayType: w.displayType,
        size: w.size,
        title: w.title,
        textBody: "",
        compare: false,
      },
    });
    created++;
  }

  return NextResponse.json({ created, unsupported: result.unsupported });
}
