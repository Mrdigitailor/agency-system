// ה-API של פורטל הלידים העצמאי — המוצר שהלקוח מקבל.
// גישה לפי טוקן בלתי ניתן לניחוש (כמו הדשבורד הציבורי); "demo" מגיש נתוני הדגמה.
// GET: רשימה + מספרים, או ?id= לפירוט ליד. PATCH: עדכון סטטוס ידני.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { loadFunnel, loadFunnelDetail, FUNNEL_STATUS_OPTIONS } from "@/lib/prospect/funnel-data";
import { DEMO_ROWS, DEMO_STATS, demoDetail } from "@/lib/prospect/demo-data";

export const dynamic = "force-dynamic";

async function resolvePortal(token: string): Promise<{ name: string; demo: boolean } | null> {
  if (token === "demo") return { name: "העסק שלך", demo: true };
  if (!/^[a-z0-9-]{16,40}$/i.test(token)) return null;
  const portal = await prisma.funnelPortal.findUnique({ where: { token } });
  return portal ? { name: portal.name, demo: false } : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const detail = portal.demo ? demoDetail(id) : await loadFunnelDetail(id, process.env.APP_BASE_URL ?? url.origin);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(detail);
  }

  if (portal.demo) {
    return NextResponse.json({ name: portal.name, demo: true, rows: DEMO_ROWS, stats: DEMO_STATS });
  }
  const days = Number(url.searchParams.get("days")) || 30;
  const data = await loadFunnel(days, process.env.APP_BASE_URL ?? url.origin);
  return NextResponse.json({ name: portal.name, demo: false, ...data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id : "";
  const funnelStatus = typeof body.funnelStatus === "string" ? body.funnelStatus.trim().slice(0, 40) : null;
  if (!id || funnelStatus === null || (funnelStatus !== "" && !FUNNEL_STATUS_OPTIONS.includes(funnelStatus))) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  // בדמו מאשרים בלי לשמור — ההדגמה נשארת נקייה לפגישה הבאה
  if (portal.demo) return NextResponse.json({ ok: true, funnelStatus });

  const chat = await prisma.prospectChat.update({ where: { id }, data: { funnelStatus } }).catch(() => null);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, funnelStatus });
}
