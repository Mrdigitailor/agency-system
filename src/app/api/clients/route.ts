import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { syncClientManagers } from "@/lib/utils/syncManagers";
import { countConversions } from "@/lib/utils/metaMetrics";

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

  // שליפת insights של החודש הנוכחי לכל לקוח
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const clientIds = clients.map((c) => c.id);
  const insights = clientIds.length > 0 ? await prisma.metaInsightDaily.findMany({
    where: { clientId: { in: clientIds }, date: { gte: monthStart } },
    select: { clientId: true, spend: true, conversions: true, purchases: true, leads: true, actionsJson: true },
  }) : [];

  // קיבוץ לפי clientId
  const byClient = new Map<string, typeof insights>();
  for (const ins of insights) {
    if (!byClient.has(ins.clientId)) byClient.set(ins.clientId, []);
    byClient.get(ins.clientId)!.push(ins);
  }

  const parsed = clients.map((c) => {
    const clientInsights = byClient.get(c.id) ?? [];
    const spend = clientInsights.reduce((s, i) => s + i.spend, 0);
    const conv = clientInsights.length > 0 ? countConversions(clientInsights, c.metaConversionEvent ?? "") : 0;
    const costPerConv = conv > 0 ? spend / conv : 0;
    return {
      ...c,
      platforms: JSON.parse(c.platforms),
      customAssets: JSON.parse(c.customAssets ?? "[]"),
      currentMonthSpend: spend,
      currentMonthConversions: conv,
      currentMonthCostPerConv: costPerConv,
      hasMetaData: clientInsights.length > 0,
    };
  });

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
