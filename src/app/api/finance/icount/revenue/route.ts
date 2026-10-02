import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/icount/revenue — נתוני ההכנסות המסונכרנים מ-iCount לתצוגה בטאב הפיננסים.
 * אדמין בלבד (נתוני תשלומים רגישים). מחזיר שורה פר לקוח מקושר + לקוחות פעילים בלי קישור.
 */
export async function GET() {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const [revenues, links, clients] = await Promise.all([
    prisma.icountRevenue.findMany(),
    prisma.icountLink.findMany({ select: { clientId: true } }),
    prisma.client.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, status: true,
        monthlyRetainer: true, dealType: true, paymentCurrency: true, contractStartDate: true,
      },
    }),
  ]);

  const byClient = new Map(revenues.map((r) => [r.clientId, r]));
  const linkedIds = new Set(links.map((l) => l.clientId));

  const rows = clients
    .filter((c) => byClient.has(c.id))
    .map((c) => {
      const r = byClient.get(c.id)!;
      return {
        clientId: c.id,
        name: c.name,
        status: c.status,
        monthlyRetainer: c.monthlyRetainer,
        dealType: c.dealType,
        totalGross: r.totalGross,
        yearNet: r.yearNet,
        docCount: r.docCount,
        firstDocDate: r.firstDocDate,
        lastDocDate: r.lastDocDate,
      };
    })
    .sort((a, b) => b.totalGross - a.totalGross);

  // לקוחות פעילים שאין להם אף כרטיס iCount מקושר — כדי שסער יראה מי חסר
  const unlinked = clients
    .filter((c) => !linkedIds.has(c.id) && c.status !== "inactive")
    .map((c) => c.name);

  const syncedAt = revenues.reduce<Date | null>(
    (latest, r) => (!latest || r.syncedAt > latest ? r.syncedAt : latest), null);

  return NextResponse.json({ rows, unlinked, syncedAt });
}
