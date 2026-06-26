import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "./api-guard";

/**
 * מאמת משתמש פורטל ומחזיר את ה-clientId המשויך אליו.
 * מחזיר NextResponse (401/403) אם לא מאומת או ללא לקוח משויך.
 */
export async function requirePortalClient(): Promise<{ user: AuthUser; clientId: string } | NextResponse> {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const user = auth as AuthUser;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { assignedClientIds: true } });
  let ids: string[] = [];
  try {
    const p = JSON.parse(dbUser?.assignedClientIds ?? "[]");
    if (Array.isArray(p)) ids = p.filter((x) => typeof x === "string" && x);
  } catch {}
  if (ids.length === 0) return NextResponse.json({ error: "אין לקוח משויך לחשבון זה" }, { status: 403 });

  return { user, clientId: ids[0] };
}
