import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;

  const widgets = await prisma.dashboardWidget.findMany({
    where: { clientId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(widgets.map((w) => ({
    ...w,
    metrics: JSON.parse(w.metrics || "[]"),
    filters: JSON.parse(w.filters || "[]"),
  })));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;
  const body = await req.json();

  const count = await prisma.dashboardWidget.count({ where: { clientId } });

  const widget = await prisma.dashboardWidget.create({
    data: {
      clientId,
      sortOrder: count,
      platform: body.platform ?? "meta",
      dataLevel: body.dataLevel ?? "campaign",
      metrics: JSON.stringify(body.metrics ?? []),
      dimension: body.dimension ?? "date",
      filters: JSON.stringify(body.filters ?? []),
      displayType: body.displayType ?? "table",
      size: body.size ?? "full",
      title: body.title ?? "",
    },
  });

  return NextResponse.json({ ...widget, metrics: JSON.parse(widget.metrics), filters: JSON.parse(widget.filters) }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.platform !== undefined) data.platform = body.platform;
  if (body.dataLevel !== undefined) data.dataLevel = body.dataLevel;
  if (body.metrics !== undefined) data.metrics = JSON.stringify(body.metrics);
  if (body.dimension !== undefined) data.dimension = body.dimension;
  if (body.filters !== undefined) data.filters = JSON.stringify(body.filters);
  if (body.displayType !== undefined) data.displayType = body.displayType;
  if (body.size !== undefined) data.size = body.size;
  if (body.title !== undefined) data.title = body.title;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  const widget = await prisma.dashboardWidget.update({ where: { id: body.id }, data });
  return NextResponse.json({ ...widget, metrics: JSON.parse(widget.metrics), filters: JSON.parse(widget.filters) });
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get("widgetId");
  if (!id) return NextResponse.json({ error: "Missing widgetId" }, { status: 400 });
  await prisma.dashboardWidget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
