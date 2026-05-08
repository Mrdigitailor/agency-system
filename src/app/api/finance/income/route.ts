import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export async function GET(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  // Auto-generate rows for active clients that don't have one yet
  const activeClients = await prisma.client.findMany({
    where: { status: { not: "inactive" }, deletedAt: null },
    select: { id: true, name: true, monthlyRetainer: true },
  });

  const existingRows = await prisma.income.findMany({
    where: { month, year },
    orderBy: { createdAt: "desc" },
  });

  const existingClientNames = new Set(existingRows.map((r) => r.clientName));
  const existingClientIds = new Set(existingRows.filter((r) => r.clientId).map((r) => r.clientId));

  const toCreate: Array<{ month: number; year: number; clientId: string; clientName: string; amount: number; vat: number }> = [];
  for (const client of activeClients) {
    if (existingClientIds.has(client.id) || existingClientNames.has(client.name)) continue;
    const amount = client.monthlyRetainer ?? 0;
    toCreate.push({
      month, year,
      clientId: client.id,
      clientName: client.name,
      amount,
      vat: Math.round(amount * 0.18 * 100) / 100,
    });
  }

  if (toCreate.length > 0) {
    await prisma.income.createMany({ data: toCreate });
  }

  // Re-fetch with auto-generated rows
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
