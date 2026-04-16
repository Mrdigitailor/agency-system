import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { syncClientManagers } from "@/lib/utils/syncManagers";

// שדות שמנהל קמפיינים לא יכול לשנות
const ADMIN_ONLY_FIELDS = new Set([
  "campaignManager", "campaignManagerId",
  "accountManager", "accountManagerId",
  "managerId", "managerUser",
  "monthlyBudget", "currency",
  "status", "clientType",
  "name",
]);

// שדות שלעולם לא צריכים להגיע ל-update (computed / relation)
const EXCLUDE_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "deletedAt",
  "optimizations", "tasks", "leads", "reports", "alerts",
  "chatRoom", "platformConnections", "profile",
  "hasMetaData", "currentMonthSpend", "currentMonthConversions", "currentMonthCostPerConv",
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: { optimizations: { orderBy: { createdAt: "desc" } } },
  });
  if (!client || client.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...client,
    platforms: JSON.parse(client.platforms),
    customAssets: JSON.parse(client.customAssets ?? "[]"),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const { id } = await params;
  const body = await req.json();

  console.log(`[Client PATCH] clientId=${id} | user=${user.name} (${user.role}) | fields: ${Object.keys(body).join(", ")}`);

  // סנן שדות שלא צריכים להגיע ל-update
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    // דלג על שדות שאסור לעדכן
    if (EXCLUDE_FIELDS.has(key)) continue;

    // מנהל קמפיינים — חסום שדות admin-only
    if (user.role === "campaignManager" && ADMIN_ONLY_FIELDS.has(key)) {
      console.log(`[Client PATCH] BLOCKED field "${key}" for campaignManager`);
      continue;
    }

    // לא לדרוס עם undefined
    if (value === undefined) continue;

    // לא לאפשר דריסת campaignManager/campaignManagerId ל-null/ריק (חוץ מ-admin)
    if (
      (key === "campaignManager" || key === "campaignManagerId") &&
      (value === null || value === "") &&
      user.role !== "admin"
    ) {
      console.log(`[Client PATCH] Prevented ${key} from being set to null/empty by ${user.role}`);
      continue;
    }

    data[key] = value;
  }

  // JSON stringify for array fields
  if (data.platforms && typeof data.platforms !== "string") {
    data.platforms = JSON.stringify(data.platforms);
  }
  if (data.customAssets && typeof data.customAssets !== "string") {
    data.customAssets = JSON.stringify(data.customAssets);
  }

  console.log(`[Client PATCH] Applying fields: ${Object.keys(data).join(", ")}`);

  const client = await prisma.client.update({ where: { id }, data });

  // אם שונו מנהלים — סנכרן את assignedClientIds
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
