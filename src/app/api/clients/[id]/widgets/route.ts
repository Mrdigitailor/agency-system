import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;
  const reportId = new URL(req.url).searchParams.get("reportId");

  const widgets = await prisma.dashboardWidget.findMany({
    where: { clientId, ...(reportId ? { reportId } : {}) },
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

  const reportId = typeof body.reportId === "string" ? body.reportId : null;
  const count = await prisma.dashboardWidget.count({ where: { clientId, ...(reportId ? { reportId } : {}) } });

  const widget = await prisma.dashboardWidget.create({
    data: {
      clientId,
      reportId,
      sortOrder: count,
      platform: body.platform ?? "meta",
      dataLevel: body.dataLevel ?? "campaign",
      metrics: JSON.stringify(body.metrics ?? []),
      dimension: body.dimension ?? "date",
      filters: JSON.stringify(body.filters ?? []),
      displayType: body.displayType ?? "table",
      size: body.size ?? "full",
      title: body.title ?? "",
      textBody: body.textBody ?? "",
      compare: Boolean(body.compare),
    },
  });

  return NextResponse.json({ ...widget, metrics: JSON.parse(widget.metrics), filters: JSON.parse(widget.filters) }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // בעלות: הווידג'ט חייב להשתייך ללקוח שב-URL
  const owned = await prisma.dashboardWidget.findFirst({ where: { id: body.id, clientId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "ווידג'ט לא נמצא" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.platform !== undefined) data.platform = body.platform;
  if (body.dataLevel !== undefined) data.dataLevel = body.dataLevel;
  if (body.metrics !== undefined) data.metrics = JSON.stringify(body.metrics);
  if (body.dimension !== undefined) data.dimension = body.dimension;
  if (body.filters !== undefined) data.filters = JSON.stringify(body.filters);
  if (body.displayType !== undefined) data.displayType = body.displayType;
  if (body.size !== undefined) data.size = body.size;
  if (body.title !== undefined) data.title = body.title;
  if (body.textBody !== undefined) data.textBody = body.textBody;
  if (body.compare !== undefined) data.compare = Boolean(body.compare);
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  const widget = await prisma.dashboardWidget.update({ where: { id: body.id }, data });
  return NextResponse.json({ ...widget, metrics: JSON.parse(widget.metrics), filters: JSON.parse(widget.filters) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;
  const id = new URL(req.url).searchParams.get("widgetId");
  if (!id) return NextResponse.json({ error: "Missing widgetId" }, { status: 400 });
  // deleteMany עם clientId — מוחק רק אם הווידג'ט שייך ללקוח שב-URL
  const res = await prisma.dashboardWidget.deleteMany({ where: { id, clientId } });
  if (res.count === 0) return NextResponse.json({ error: "ווידג'ט לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// PUT — סידור מחדש (drag & drop): { order: [widgetId,...] }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId } = await params;
  const body = await req.json();
  const order: string[] = Array.isArray(body.order) ? body.order : [];
  if (order.length === 0) return NextResponse.json({ error: "Missing order" }, { status: 400 });

  // updateMany עם clientId — מסדר רק ווידג'טים של הלקוח שב-URL
  await prisma.$transaction(order.map((id, i) => prisma.dashboardWidget.updateMany({ where: { id, clientId }, data: { sortOrder: i } })));
  return NextResponse.json({ ok: true });
}
