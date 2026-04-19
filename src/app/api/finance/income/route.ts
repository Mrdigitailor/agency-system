import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export async function GET(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  const rows = await prisma.income.findMany({
    where: { month, year },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const row = await prisma.income.create({
    data: {
      month: body.month ?? new Date().getMonth() + 1,
      year: body.year ?? new Date().getFullYear(),
      clientId: body.clientId || null,
      clientName: body.clientName ?? "",
      terms: body.terms ?? "",
      invoiceIssued: body.invoiceIssued ?? false,
      invoiceDate: body.invoiceDate ?? "",
      amount: body.amount ?? 0,
      vat: body.vat ?? 0,
      paid: body.paid ?? false,
      receiptIssued: body.receiptIssued ?? false,
      collectionDate: body.collectionDate ?? "",
      serviceMonth: body.serviceMonth ?? "",
      paymentTerms: body.paymentTerms ?? "",
      automated: body.automated ?? false,
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
  const row = await prisma.income.update({ where: { id }, data });
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  await prisma.income.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
