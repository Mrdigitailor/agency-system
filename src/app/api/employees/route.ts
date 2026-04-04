import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { sendWelcomeEmail } from "@/lib/email/resend";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      assignedClientIds: true, createdAt: true, updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Parse JSON field
  const parsed = users.map((u) => ({
    ...u,
    assignedClientIds: JSON.parse(u.assignedClientIds),
  }));

  return NextResponse.json(parsed);
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  if (!body.name || !body.email || !body.password) {
    return NextResponse.json({ error: "שם, אימייל וסיסמה נדרשים" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: "אימייל כבר קיים במערכת" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone ?? "",
      role: body.role ?? "campaignManager",
      password: hashedPassword,
      isActive: true,
      assignedClientIds: JSON.stringify(body.assignedClientIds ?? []),
    },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      assignedClientIds: true, createdAt: true, updatedAt: true,
    },
  });

  // שליחת מייל ברוכים הבאים
  if (body.sendEmail) {
    console.log("[Employee API] sendEmail=true, sending welcome email to:", body.email);
    const loginUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login`;
    const emailResult = await sendWelcomeEmail({
      to: body.email,
      name: body.name,
      email: body.email,
      password: body.password,
      loginUrl,
    });
    console.log("[Employee API] Email result:", JSON.stringify(emailResult));
  }

  return NextResponse.json(
    { ...user, assignedClientIds: JSON.parse(user.assignedClientIds) },
    { status: 201 }
  );
}
