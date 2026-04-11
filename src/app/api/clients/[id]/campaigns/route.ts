import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/clients/[id]/campaigns
 * מחזיר רשימת קמפיינים ייחודית מ-MetaInsightDaily (level=campaign)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const rows = await prisma.metaInsightDaily.findMany({
    where: { clientId: id, level: "campaign" },
    select: { externalId: true, name: true },
    distinct: ["externalId"],
    orderBy: { date: "desc" },
    take: 500,
  });

  const seen = new Set<string>();
  const campaigns = rows
    .filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    })
    .map((r) => ({ id: r.externalId, name: r.name || r.externalId }));

  return NextResponse.json(campaigns);
}
