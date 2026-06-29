import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { stripAgencyPayment } from "@/lib/utils/clientPrivacy";
import { syncClientManagers } from "@/lib/utils/syncManagers";
import { countConversions } from "@/lib/utils/metaMetrics";

export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const { searchParams } = new URL(req.url);

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
    // לקוח קצה רואה רק את הלקוח/ות המשויכים אליו (פורטל)
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { assignedClientIds: true },
    });
    const assignedIds: string[] = JSON.parse(dbUser?.assignedClientIds ?? "[]");
    if (assignedIds.length === 0) {
      return NextResponse.json([]);
    }
    where.id = { in: assignedIds };
  }

  const clients = await prisma.client.findMany({
    where,
    include: { optimizations: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  // שליפת insights לפי טווח תאריכים (ברירת מחדל: החודש הנוכחי)
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const defaultEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const since = searchParams.get("since") ?? defaultStart;
  const until = searchParams.get("until") ?? defaultEnd;

  const clientIds = clients.map((c) => c.id);

  // שליפת insights מכל הפלטפורמות
  const [metaInsights, gadsInsights, ttInsights] = clientIds.length > 0 ? await Promise.all([
    prisma.metaInsightDaily.findMany({
      where: { clientId: { in: clientIds }, date: { gte: since, lte: until } },
      select: { clientId: true, spend: true, conversions: true, purchases: true, leads: true, actionsJson: true },
    }),
    prisma.googleAdsInsightDaily.findMany({
      where: { clientId: { in: clientIds }, date: { gte: since, lte: until } },
      select: { clientId: true, spend: true, conversions: true },
    }),
    prisma.tikTokInsightDaily.findMany({
      where: { clientId: { in: clientIds }, date: { gte: since, lte: until } },
      select: { clientId: true, spend: true, conversions: true },
    }),
  ]) : [[], [], []];

  // שליפת lastSyncAt לכל חיבור
  const connections = clientIds.length > 0 ? await prisma.platformConnection.findMany({
    where: { clientId: { in: clientIds }, isActive: true },
    select: { clientId: true, platform: true, lastSyncAt: true },
  }) : [];

  const syncByClient = new Map<string, Array<{ platform: string; lastSyncAt: Date | null }>>();
  for (const conn of connections) {
    if (!syncByClient.has(conn.clientId)) syncByClient.set(conn.clientId, []);
    syncByClient.get(conn.clientId)!.push({ platform: conn.platform, lastSyncAt: conn.lastSyncAt });
  }

  // קיבוץ לפי clientId
  const metaByClient = new Map<string, typeof metaInsights>();
  for (const ins of metaInsights) {
    if (!metaByClient.has(ins.clientId)) metaByClient.set(ins.clientId, []);
    metaByClient.get(ins.clientId)!.push(ins);
  }

  const gadsSpendByClient = new Map<string, number>();
  const gadsConvByClient = new Map<string, number>();
  for (const ins of gadsInsights) {
    gadsSpendByClient.set(ins.clientId, (gadsSpendByClient.get(ins.clientId) ?? 0) + ins.spend);
    gadsConvByClient.set(ins.clientId, (gadsConvByClient.get(ins.clientId) ?? 0) + ins.conversions);
  }

  const ttSpendByClient = new Map<string, number>();
  const ttConvByClient = new Map<string, number>();
  for (const ins of ttInsights) {
    ttSpendByClient.set(ins.clientId, (ttSpendByClient.get(ins.clientId) ?? 0) + ins.spend);
    ttConvByClient.set(ins.clientId, (ttConvByClient.get(ins.clientId) ?? 0) + ins.conversions);
  }

  const parsed = clients.map((c) => {
    const clientMetaInsights = metaByClient.get(c.id) ?? [];
    const metaSpend = clientMetaInsights.reduce((s, i) => s + i.spend, 0);
    const metaConv = clientMetaInsights.length > 0 ? countConversions(clientMetaInsights, c.metaConversionEvent ?? "") : 0;
    const gadsSpend = gadsSpendByClient.get(c.id) ?? 0;
    const gadsConv = gadsConvByClient.get(c.id) ?? 0;
    const ttSpend = ttSpendByClient.get(c.id) ?? 0;
    const ttConv = ttConvByClient.get(c.id) ?? 0;
    const totalSpend = metaSpend + gadsSpend + ttSpend;
    const totalConv = metaConv + gadsConv + ttConv;
    const costPerConv = totalConv > 0 ? totalSpend / totalConv : 0;
    return {
      ...c,
      platforms: JSON.parse(c.platforms),
      customAssets: JSON.parse(c.customAssets ?? "[]"),
      currentMonthSpend: totalSpend,
      currentMonthConversions: totalConv,
      currentMonthCostPerConv: costPerConv,
      hasMetaData: clientMetaInsights.length > 0 || gadsInsights.length > 0 || ttInsights.length > 0,
      platformSyncs: (syncByClient.get(c.id) ?? []).map((s) => ({ platform: s.platform, lastSyncAt: s.lastSyncAt?.toISOString() ?? null })),
    };
  });

  // "התשלום אלינו" לא שקוף למנהל קמפיינים
  return NextResponse.json(parsed.map((c) => stripAgencyPayment(c, user.role)));
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
