import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const count = await prisma.user.count({ where: { role: "admin", isActive: true } });
  return NextResponse.json({ needsSetup: count === 0 });
}

export async function POST(req: Request) {
  // בדיקה שאין כבר admin
  const count = await prisma.user.count({ where: { role: "admin", isActive: true } });
  if (count > 0) {
    return NextResponse.json({ error: "מנהל כבר קיים במערכת" }, { status: 400 });
  }

  const body = await req.json();
  if (!body.name || !body.email || !body.password) {
    return NextResponse.json({ error: "כל השדות נדרשים" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      password: hashedPassword,
      role: "admin",
    },
  });

  return NextResponse.json({ id: user.id, name: user.name, email: user.email }, { status: 201 });
}
