import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const body = await req.json();
  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json({ error: "כל השדות נדרשים" }, { status: 400 });
  }
  if (body.newPassword.length < 6) {
    return NextResponse.json({ error: "הסיסמה חייבת להיות לפחות 6 תווים" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
  }

  const isValid = await bcrypt.compare(body.currentPassword, dbUser.password);
  if (!isValid) {
    return NextResponse.json({ error: "הסיסמה הנוכחית שגויה" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(body.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

  return NextResponse.json({ ok: true });
}
