import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

export async function DELETE() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  await prisma.googleCalendarConnection.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ ok: true });
}
