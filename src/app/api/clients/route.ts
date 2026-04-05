import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { syncClientManagers } from "@/lib/utils/syncManagers";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  // סינון לפי תפקיד
  const where: Record<string, unknown> = { deletedAt: null };

  if (user.role === "campaignManager") {
    // מנהל קמפיינים רואה רק לקוחות שמשויכים אליו ב-assignedClientIds
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { assignedClientIds: true },
    });
    const assignedIds: string[] = JSON.parse(dbUser?.assignedClientIds ?? "[]");
    if (assignedIds.length === 0) {
      return NextResponse.json([]);
    }
    where.id = { in: assignedIds };
  } else if (user.role === "client") {
    return NextResponse.json([]);
  }

  const clients = await prisma.client.findMany({
    where,
    include: { optimizations: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  // שליפת spend של החודש הנוכחי לכל לקוח מ-Meta
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const clientIds = clients.map((c) => c.id);
  const spendRows = clientIds.length > 0 ? await prisma.metaInsightDaily.groupBy({
    by: ["clientId"],
    where: { clientId: { in: clientIds }, date: { gte: monthStart } },
    _sum: { spend: true },
  }) : [];
  const spendMap = new Map(spendRows.map((r) => [r.clientId, r._sum.spend ?? 0]));

  const parsed = clients.map((c) => ({
    ...c,
    platforms: JSON.parse(c.platforms),
    customAssets: JSON.parse(c.customAssets ?? "[]"),
    currentMonthSpend: spendMap.get(c.id) ?? 0,
  }));

  return NextResponse.json(parsed);
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const body = await req.json();

  const client = await prisma.client.create({
    data: {
      name: body.name,
      manager: body.manager ?? "",
      campaignManager: body.campaignManager ?? "",
      accountManager: body.accountManager ?? "",
      platforms: JSON.stringify(body.platforms ?? []),
      customAssets: JSON.stringify(body.customAssets ?? []),
      monthlyBudget: body.monthlyBudget ?? 0,
      currency: body.currency ?? "ILS",
      metaConversionEvent: body.metaConversionEvent ?? "",
      clientType: body.clientType ?? "לידים",
      status: body.status ?? "active",
      contactEmail: body.contactEmail ?? "",
      contactPhone: body.contactPhone ?? "",
      notes: body.notes ?? "",
      metaAdAccount: body.metaAdAccount ?? "",
      googleAdAccount: body.googleAdAccount ?? "",
      tiktokAdAccount: body.tiktokAdAccount ?? "",
      facebookPage: body.facebookPage ?? "",
      instagram: body.instagram ?? "",
      linkedin: body.linkedin ?? "",
      website: body.website ?? "",
      budgetUsed: body.budgetUsed ?? 0,
      avgCostPerConversion: body.avgCostPerConversion ?? 0,
      targetCostPerConversion: body.targetCostPerConversion ?? 0,
      conversionsThisMonth: body.conversionsThisMonth ?? 0,
      targetConversions: body.targetConversions ?? 0,
      lastOptimization: body.lastOptimization ?? "",
    },
  });

  // סנכרון assignedClientIds של העובדים הנבחרים
  await syncClientManagers(client.id, body.campaignManager ?? "", body.accountManager ?? "");

  return NextResponse.json({ ...client, platforms: JSON.parse(client.platforms) }, { status: 201 });
}
