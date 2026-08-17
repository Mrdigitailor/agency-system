import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { safeParseArray } from "@/lib/utils/safeJson";
import { monthStartIL, todayIL } from "@/lib/utils/ildate";
import { stripAgencyPayment } from "@/lib/utils/clientPrivacy";
import { syncClientManagers } from "@/lib/utils/syncManagers";
import { countMetaCampaignResults, countGoogleCampaignResults, countTiktokCampaignResults } from "@/lib/utils/campaignResults";
import { parseGoogleActions } from "@/lib/utils/googleMetrics";

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
    const assignedIds = safeParseArray(dbUser?.assignedClientIds) as string[];
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
    const assignedIds = safeParseArray(dbUser?.assignedClientIds) as string[];
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

  // שליפת insights לפי טווח תאריכים (ברירת מחדל: החודש הנוכחי, שעון ישראל)
  const since = searchParams.get("since") ?? monthStartIL();
  const until = searchParams.get("until") ?? todayIL();

  const clientIds = clients.map((c) => c.id);

  // שליפת insights מכל הפלטפורמות
  const [metaInsights, gadsInsights, ttInsights] = clientIds.length > 0 ? await Promise.all([
    prisma.metaInsightDaily.findMany({
      // level="campaign" בלבד — אחרת מסכמים גם adset+ad = ספירה משולשת
      where: { clientId: { in: clientIds }, level: "campaign", date: { gte: since, lte: until } },
      select: { clientId: true, spend: true, conversions: true, purchases: true, leads: true, actionsJson: true, name: true, externalId: true },
    }),
    prisma.googleAdsInsightDaily.findMany({
      where: { clientId: { in: clientIds }, date: { gte: since, lte: until } },
      select: { clientId: true, spend: true, conversions: true, campaignId: true, campaignName: true, conversionsByAction: true },
    }),
    prisma.tikTokInsightDaily.findMany({
      where: { clientId: { in: clientIds }, date: { gte: since, lte: until } },
      select: { clientId: true, spend: true, conversions: true, campaignId: true, campaignName: true },
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

  const gadsByClient = new Map<string, typeof gadsInsights>();
  const gadsSpendByClient = new Map<string, number>();
  for (const ins of gadsInsights) {
    (gadsByClient.get(ins.clientId) ?? gadsByClient.set(ins.clientId, []).get(ins.clientId)!).push(ins);
    gadsSpendByClient.set(ins.clientId, (gadsSpendByClient.get(ins.clientId) ?? 0) + ins.spend);
  }

  const ttByClient = new Map<string, typeof ttInsights>();
  const ttSpendByClient = new Map<string, number>();
  for (const ins of ttInsights) {
    (ttByClient.get(ins.clientId) ?? ttByClient.set(ins.clientId, []).get(ins.clientId)!).push(ins);
    ttSpendByClient.set(ins.clientId, (ttSpendByClient.get(ins.clientId) ?? 0) + ins.spend);
  }

  const parsed = clients.map((c) => {
    // ספירת המרות פר-קמפיין לפי ה-Result (כמו בסקירה הכללית) — מכבד בחירת אירועי
    // מטא/גוגל והחרגות קמפיינים, כדי שהקוביה בטאב הלקוחות תהיה עקבית עם הסקירה.
    const excluded = safeParseArray(c.excludedCampaigns).filter((x): x is string => typeof x === "string");
    const clientMetaInsights = metaByClient.get(c.id) ?? [];
    const metaSpend = clientMetaInsights.reduce((s, i) => s + i.spend, 0);
    const metaConv = clientMetaInsights.length > 0 ? countMetaCampaignResults(clientMetaInsights, excluded).total : 0;
    const gadsRows = gadsByClient.get(c.id) ?? [];
    const gadsSpend = gadsSpendByClient.get(c.id) ?? 0;
    const gadsConv = gadsRows.length > 0 ? countGoogleCampaignResults(gadsRows, parseGoogleActions(c.googleConversionAction ?? ""), excluded).total : 0;
    const ttRows = ttByClient.get(c.id) ?? [];
    const ttSpend = ttSpendByClient.get(c.id) ?? 0;
    const ttConv = ttRows.length > 0 ? countTiktokCampaignResults(ttRows, excluded).total : 0;
    const totalSpend = metaSpend + gadsSpend + ttSpend;
    const totalConv = metaConv + gadsConv + ttConv;
    const costPerConv = totalConv > 0 ? totalSpend / totalConv : 0;
    return {
      ...c,
      platforms: safeParseArray(c.platforms),
      customAssets: safeParseArray(c.customAssets),
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

  return NextResponse.json({ ...client, platforms: safeParseArray(client.platforms) }, { status: 201 });
}
