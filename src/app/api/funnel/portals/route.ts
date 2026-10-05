// ניהול פורטלי הלקוחות (פנימי, אדמין בלבד): כל לקוח מקבל פורטל משלו עם קישור ייחודי.
// GET: רשימת הפורטלים + הלקוחות שאפשר לחבר. POST: פורטל חדש.
// PATCH: עדכון, איפוס סיסמה (הלקוח יקבע חדשה בכניסה הבאה), או הסרה רכה.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export async function GET(req: Request) {
  const guard = await requireRole(["admin"]);
  if (guard instanceof NextResponse) return guard;

  const appBase = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const [portals, clients] = await Promise.all([
    prisma.funnelPortal.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.client.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const counts = await prisma.prospectChat.groupBy({ by: ["portalId"], _count: { _all: true } });
  const countBy = new Map(counts.map((c) => [c.portalId, c._count._all]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return NextResponse.json({
    portals: portals.map((p) => ({
      id: p.id, name: p.name, slug: p.slug ?? "", isDefault: p.isDefault,
      link: `${appBase}/leads/${p.token}`,
      chatLink: p.slug ? `${appBase}/start?p=${p.slug}` : "",
      clientId: p.clientId ?? "", clientName: p.clientId ? clientName.get(p.clientId) ?? "" : "",
      ownerEmail: p.ownerEmail, hasPassword: Boolean(p.passwordHash),
      chats: countBy.get(p.id) ?? 0, createdAt: p.createdAt,
    })),
    clients,
  });
}

export async function POST(req: Request) {
  const guard = await requireRole(["admin"]);
  if (guard instanceof NextResponse) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("bad request"); }
  const name = str(body.name);
  if (!name) return bad("חסר שם");
  const ownerEmail = str(body.ownerEmail).toLowerCase();
  if (ownerEmail && !EMAIL_RE.test(ownerEmail)) return bad("כתובת מייל לא תקינה");
  const slug = str(body.slug, 40).toLowerCase();
  if (slug && !SLUG_RE.test(slug)) return bad("המזהה יכול לכלול רק אותיות באנגלית, ספרות ומקף");
  if (slug && await prisma.funnelPortal.findUnique({ where: { slug } })) return bad("המזהה הזה כבר תפוס");
  const clientId = str(body.clientId, 40) || null;
  if (clientId && !(await prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } }))) return bad("הלקוח לא נמצא");

  const portal = await prisma.funnelPortal.create({ data: { name, ownerEmail, slug: slug || null, clientId } });
  return NextResponse.json({ ok: true, id: portal.id });
}

export async function PATCH(req: Request) {
  const guard = await requireRole(["admin"]);
  if (guard instanceof NextResponse) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("bad request"); }
  const id = str(body.id, 40);
  const portal = id ? await prisma.funnelPortal.findFirst({ where: { id, deletedAt: null } }) : null;
  if (!portal) return bad("not found", 404);
  const action = str(body.action, 20);

  if (action === "resetPassword") {
    await prisma.funnelPortal.update({ where: { id }, data: { passwordHash: "", failedLogins: 0, lockedUntil: null } });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    if (portal.isDefault) return bad("אי אפשר להסיר את פורטל ברירת המחדל");
    // הסרה רכה: הקישור מפסיק לעבוד, הנתונים נשארים
    await prisma.funnelPortal.update({ where: { id }, data: { deletedAt: new Date(), slug: null } });
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = str(body.name);
  if (typeof body.ownerEmail === "string") {
    const email = str(body.ownerEmail).toLowerCase();
    if (email && !EMAIL_RE.test(email)) return bad("כתובת מייל לא תקינה");
    data.ownerEmail = email;
  }
  if (typeof body.clientId === "string") {
    const clientId = str(body.clientId, 40) || null;
    if (clientId && !(await prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } }))) return bad("הלקוח לא נמצא");
    data.clientId = clientId;
  }
  await prisma.funnelPortal.update({ where: { id }, data: data as never });
  return NextResponse.json({ ok: true });
}
