import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export async function GET(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  const rows = await prisma.expense.findMany({
    where: { month, year },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const amount = body.amount ?? 0;
  const amountBeforeVat = body.amountBeforeVat ?? Math.round((amount / 1.18) * 100) / 100;
  const vat = body.vat ?? Math.round((amount - amountBeforeVat) * 100) / 100;

  const row = await prisma.expense.create({
    data: {
      month: body.month ?? new Date().getMonth() + 1,
      year: body.year ?? new Date().getFullYear(),
      category: body.category ?? "",
      expenseType: body.expenseType ?? "",
      paymentMethod: body.paymentMethod ?? "",
      creditCardLast4: body.creditCardLast4 ?? "",
      amount,
      amountBeforeVat,
      vat,
      chargeDate: body.chargeDate ?? "",
      clearingDate: body.clearingDate ?? "",
      filed: body.filed ?? false,
      requiresReceipt: body.requiresReceipt ?? false,
      receiptProvided: body.receiptProvided ?? false,
    },
  });

  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { id, ...data } = body;
  const row = await prisma.expense.update({ where: { id }, data });
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
