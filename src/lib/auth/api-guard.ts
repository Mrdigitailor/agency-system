import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as AuthUser;
}

export function unauthorized() {
  return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
}

export async function requireAuth(): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  return user;
}

export async function requireRole(roles: string[]): Promise<AuthUser | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (!roles.includes(result.role)) return forbidden();
  return result;
}
