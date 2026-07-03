import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { buildSmartDashboard } from "@/lib/agent/dashboard-builder";

export const dynamic = "force-dynamic";

/**
 * POST /api/clients/[id]/reports/auto-build
 * בונה "דשבורד חכם" — ClientReport חדש עם ווידג'טים שנגזרים אוטומטית
 * מפרופיל העסק (סוג עסק, פלטפורמות פעילות, כוכב הצפון).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;

  try {
    const result = await buildSmartDashboard(clientId);
    return NextResponse.json(
      { ...result.report, widgetCount: result.widgetCount, businessType: result.businessType, platforms: result.platforms },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "שגיאה בבניית הדשבורד" }, { status: 400 });
  }
}
