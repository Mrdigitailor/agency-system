import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/clients/[id]/finance — הנתונים הפיננסיים של לקוח בודד מ-iCount.
 * אדמין בלבד — נתוני תשלומים רגישים, מוסתרים ממנהלי קמפיינים.
 * מחזיר: סיכום (ללא מע"מ / מע"מ / כולל), תנאי התקשרות, ורשימת כל המסמכים.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const [client, revenue, docs] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      select: {
        name: true, status: true,
        monthlyRetainer: true, dealType: true, paymentCurrency: true,
        contractStartDate: true, specialTerms: true,
      },
    }),
    prisma.icountRevenue.findUnique({ where: { clientId: id } }),
    prisma.icountDoc.findMany({
      where: { clientId: id },
      orderBy: { dateissued: "desc" },
      take: 200,
    }),
  ]);

  if (!client) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  // יתרה פתוחה לגבייה — חשבוניות שטרם נפרעו במלואן
  const openBalance = docs.reduce((s, d) => s + (d.beforeVat >= 0 ? d.remaining : 0), 0);

  return NextResponse.json({
    client,
    summary: revenue
      ? {
          totalNet: revenue.totalNet,
          totalVat: revenue.totalVat,
          totalGross: revenue.totalGross,
          yearNet: revenue.yearNet,
          yearVat: revenue.yearVat,
          yearGross: revenue.yearGross,
          docCount: revenue.docCount,
          firstDocDate: revenue.firstDocDate,
          lastDocDate: revenue.lastDocDate,
          syncedAt: revenue.syncedAt,
        }
      : null,
    openBalance,
    docs: docs.map((d) => ({
      id: d.id,
      account: d.account,
      doctype: d.doctype,
      docnum: d.docnum,
      dateissued: d.dateissued,
      beforeVat: d.beforeVat,
      vatAmount: d.vatAmount,
      withVat: d.withVat,
      remaining: d.remaining,
    })),
  });
}
