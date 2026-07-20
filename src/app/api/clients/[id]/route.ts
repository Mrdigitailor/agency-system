import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { syncClientManagers } from "@/lib/utils/syncManagers";
import { stripAgencyPayment } from "@/lib/utils/clientPrivacy";

// Whitelist — שדות שמנהל קמפיינים מורשה לערוך
const CM_ALLOWED_FIELDS = new Set([
  // נכסים דיגיטליים
  "metaAdAccount", "googleAdAccount", "tiktokAdAccount",
  "facebookPage", "instagram", "linkedin", "website",
  "customAssets",
  // הערות
  "notes",
  // Meta conversion event (נבחר בכרטיס)
  "metaConversionEvent",
  // תקציב המדיה החודשי — מנהל הקמפיינים אחראי עליו בפועל.
  // (התשלום שלנו — monthlyRetainer וכו' — נשאר admin-only ומוסתר ע"י stripAgencyPayment)
  "monthlyBudget",
]);

// שדות שאף אחד חוץ מ-admin לא יכול לגעת בהם
const ADMIN_ONLY_FIELDS = new Set([
  "campaignManager", "campaignManagerId",
  "accountManager", "accountManagerId",
  "managerId",
  "name",
  "status", "clientType",
  "currency",
  "targetConversions", "targetCostPerConversion",
  "platforms",
]);

// שדות שלעולם לא מגיעים ל-update
const EXCLUDE_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "deletedAt",
  "optimizations", "tasks", "leads", "reports", "alerts",
  "chatRoom", "platformConnections", "profile",
  "hasMetaData", "currentMonthSpend", "currentMonthConversions", "currentMonthCostPerConv",
  "performance", "digitalAssets",
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: { optimizations: { orderBy: { createdAt: "desc" } } },
  });
  if (!client || client.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // "התשלום אלינו" לא שקוף למנהל קמפיינים
  return NextResponse.json(stripAgencyPayment({
    ...client,
    platforms: JSON.parse(client.platforms),
    customAssets: JSON.parse(client.customAssets ?? "[]"),
  }, user.role));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const { id } = await params;
  const body = await req.json();

  // שמור מצב נוכחי לצורך logging
  const before = await prisma.client.findUnique({
    where: { id },
    select: { campaignManager: true, campaignManagerId: true },
  });

  console.log(`[Client PATCH] clientId=${id} | user=${user.name} (${user.role})`);
  console.log(`[Client PATCH] Body fields: ${Object.keys(body).join(", ")}`);
  console.log(`[Client PATCH] campaignManagerId BEFORE: ${before?.campaignManagerId}`);

  // בנה את data object לפי תפקיד
  const data: Record<string, unknown> = {};

  if (user.role === "campaignManager") {
    // campaignManager — רק שדות מ-whitelist
    for (const key of CM_ALLOWED_FIELDS) {
      if (key in body && body[key] !== undefined) {
        data[key] = body[key];
      }
    }
    console.log(`[Client PATCH] CM whitelist applied — fields: ${Object.keys(data).join(", ")}`);
  } else {
    // admin / manager — כל השדות חוץ מ-EXCLUDE
    for (const [key, value] of Object.entries(body)) {
      if (EXCLUDE_FIELDS.has(key)) continue;
      if (value === undefined) continue;
      data[key] = value;
    }
  }

  // הגנה מוחלטת: campaignManager/Id לא משתנה ע"י לא-admin
  if (user.role !== "admin") {
    delete data.campaignManager;
    delete data.campaignManagerId;
    delete data.accountManager;
    delete data.accountManagerId;
    delete data.managerId;
  }

  // אדמין: לא לאפשר דריסת campaignManager ל-null/ריק בטעות
  if (user.role === "admin") {
    if (data.campaignManager === "" || data.campaignManager === null) {
      // אם admin שולח ריק — לא לדרוס (אלא אם במפורש שולח)
      if (!body._explicitClearCM) {
        delete data.campaignManager;
      }
    }
  }

  // JSON stringify for array fields
  if (data.platforms && typeof data.platforms !== "string") {
    data.platforms = JSON.stringify(data.platforms);
  }
  if (data.customAssets && typeof data.customAssets !== "string") {
    data.customAssets = JSON.stringify(data.customAssets);
  }

  if (Object.keys(data).length === 0) {
    console.log(`[Client PATCH] No fields to update — skipping`);
    const client = await prisma.client.findUnique({ where: { id }, include: { optimizations: { orderBy: { createdAt: "desc" } } } });
    return NextResponse.json({ ...client, platforms: JSON.parse(client!.platforms), customAssets: JSON.parse(client!.customAssets ?? "[]") });
  }

  console.log(`[Client PATCH] Final update fields: ${Object.keys(data).join(", ")}`);

  const client = await prisma.client.update({ where: { id }, data });

  console.log(`[Client PATCH] campaignManagerId AFTER: ${client.campaignManagerId}`);

  // אם שונו מנהלים — סנכרן
  if (data.campaignManager !== undefined || data.accountManager !== undefined) {
    await syncClientManagers(
      id,
      (data.campaignManager as string) ?? client.campaignManager ?? "",
      (data.accountManager as string) ?? client.accountManager ?? ""
    );
  }

  return NextResponse.json({
    ...client,
    platforms: JSON.parse(client.platforms),
    customAssets: JSON.parse(client.customAssets ?? "[]"),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
