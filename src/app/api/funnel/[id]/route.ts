// ליד בודד במשפך (הטאב הפנימי) — פירוט מלא + עדכון סטטוס ידני. אדמין ומנהלים בלבד.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { loadFunnelDetail, FUNNEL_STATUS_OPTIONS } from "@/lib/prospect/funnel-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const appBase = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const detail = await loadFunnelDetail(id, appBase);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const funnelStatus = typeof body.funnelStatus === "string" ? body.funnelStatus.trim().slice(0, 40) : null;
  if (funnelStatus === null || (funnelStatus !== "" && !FUNNEL_STATUS_OPTIONS.includes(funnelStatus))) {
    return NextResponse.json({ error: "סטטוס לא מוכר" }, { status: 400 });
  }

  const chat = await prisma.prospectChat.update({ where: { id }, data: { funnelStatus } }).catch(() => null);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, funnelStatus });
}
