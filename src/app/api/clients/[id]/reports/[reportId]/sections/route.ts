import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { appendCampaignSection } from "@/lib/dashboard/section-template";
import { classifyBusinessType } from "@/lib/agent/business-knowledge";

/**
 * POST /api/clients/[id]/reports/[reportId]/sections
 * מוסיף לדוח סקשן קמפיין שלם (כותרת + כל קוביות המידע) בפעולה אחת.
 * body: { title: string, campaignFilter: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireRole(["admin", "manager", "campaignManager"]);
  if (auth instanceof NextResponse) return auth;
  const { id: clientId, reportId } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const campaignFilter = typeof body.campaignFilter === "string" ? body.campaignFilter.trim() : "";
  const title = (typeof body.title === "string" ? body.title.trim() : "") || campaignFilter;
  if (!campaignFilter) return NextResponse.json({ error: "חסר קמפיין לסקשן" }, { status: 400 });

  // בעלות: הדוח חייב להשתייך ללקוח שב-URL
  const report = await prisma.clientReport.findFirst({ where: { id: reportId, clientId }, select: { id: true } });
  if (!report) return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { clientType: true } });
  const isEcom = classifyBusinessType(client?.clientType ?? "") === "ecommerce";

  const created = await appendCampaignSection(clientId, reportId, title, campaignFilter, isEcom);
  return NextResponse.json({ ok: true, created }, { status: 201 });
}
