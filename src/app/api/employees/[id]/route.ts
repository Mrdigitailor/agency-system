import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { sendPasswordResetEmail } from "@/lib/email/resend";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  const body = await req.json();

  // איפוס סיסמה
  if (body.newPassword) {
    const hashed = await bcrypt.hash(body.newPassword, 12);
    const user = await prisma.user.update({
      where: { id },
      data: { password: hashed },
      select: { id: true, name: true, email: true },
    });

    if (body.sendEmail) {
      const loginUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login`;
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        newPassword: body.newPassword,
        loginUrl,
      });
    }

    return NextResponse.json({ ok: true });
  }

  // עדכון פרטים רגילים
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.role !== undefined) updateData.role = body.role;
  if (body.assignedClientIds !== undefined) updateData.assignedClientIds = JSON.stringify(body.assignedClientIds);

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      assignedClientIds: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json({ ...user, assignedClientIds: JSON.parse(user.assignedClientIds as string) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id } = await params;
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
