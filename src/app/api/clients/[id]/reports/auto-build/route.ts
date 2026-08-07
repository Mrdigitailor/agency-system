import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { buildSmartDashboard } from "@/lib/agent/dashboard-builder";

export const dynamic = "force-dynamic";

/**
 * POST /api/clients/[id]/reports/auto-build
 * בונה "דשבורד חכם" — ClientReport חדש עם ווידג'טים שנגזרים אוטומטית
 * מפרופיל העסק (סוג עסק, פלטפורמות פעילות, כוכב הצפון).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;

  // variant "deep" — דשבורד מפורט פר-מוצר (דמוגרפיה + קהלים + מודעות)
  let variant: "standard" | "deep" = "standard";
  try { const body = await req.json(); if (body?.variant === "deep") variant = "deep"; } catch { /* בלי גוף — ברירת מחדל */ }

  try {
    const result = await buildSmartDashboard(clientId, { variant });
    return NextResponse.json(
      { ...result.report, widgetCount: result.widgetCount, businessType: result.businessType, platforms: result.platforms, products: result.products, variant: result.variant },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "שגיאה בבניית הדשבורד" }, { status: 400 });
  }
}
