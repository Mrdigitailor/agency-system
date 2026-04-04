import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  // סינון לפי תפקיד
  const where: Record<string, unknown> = { deletedAt: null };

  if (user.role === "campaignManager") {
    // מנהל קמפיינים רואה רק לקוחות שמשויכים אליו
    where.campaignManager = user.name;
  } else if (user.role === "client") {
    // לקוח קצה — לא רואה כלום כאן
    return NextResponse.json([]);
  }

  const clients = await prisma.client.findMany({
    where,
    include: { optimizations: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  const parsed = clients.map((c) => ({
    ...c,
    platforms: JSON.parse(c.platforms),
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
      monthlyBudget: body.monthlyBudget ?? 0,
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

  return NextResponse.json({ ...client, platforms: JSON.parse(client.platforms) }, { status: 201 });
}
