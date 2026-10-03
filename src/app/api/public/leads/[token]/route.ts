// ה-API של פורטל הלידים העצמאי — המוצר שהלקוח מקבל.
// גישה לפי טוקן בלתי ניתן לניחוש (כמו הדשבורד הציבורי); "demo" מגיש נתוני הדגמה.
// GET: ?view=leads (ברירת מחדל) | customers | results, או ?id= לפירוט ליד.
// POST: יצירת לקוח. PATCH: עדכון סטטוס ליד או עדכון לקוח (kind=customer).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { loadFunnel, loadFunnelDetail, loadResults, FUNNEL_STATUS_OPTIONS, CUSTOMER_STAGES } from "@/lib/prospect/funnel-data";
import { DEMO_ROWS, DEMO_STATS, demoDetail, DEMO_CUSTOMERS, DEMO_RESULTS } from "@/lib/prospect/demo-data";

export const dynamic = "force-dynamic";

interface Portal { id: string; name: string; demo: boolean; clientId: string | null }

async function resolvePortal(token: string): Promise<Portal | null> {
  if (token === "demo") return { id: "demo", name: "העסק שלך", demo: true, clientId: null };
  if (!/^[a-z0-9-]{16,40}$/i.test(token)) return null;
  const portal = await prisma.funnelPortal.findUnique({ where: { token } });
  return portal ? { id: portal.id, name: portal.name, demo: false, clientId: portal.clientId } : null;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const view = url.searchParams.get("view") ?? "leads";
  const days = Number(url.searchParams.get("days")) || 30;

  if (id) {
    const detail = portal.demo ? demoDetail(id) : await loadFunnelDetail(id, process.env.APP_BASE_URL ?? url.origin);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(detail);
  }

  if (view === "customers") {
    if (portal.demo) return NextResponse.json({ customers: DEMO_CUSTOMERS, stages: CUSTOMER_STAGES });
    const customers = await prisma.portalCustomer.findMany({ where: { portalId: portal.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ customers, stages: CUSTOMER_STAGES });
  }

  if (view === "results") {
    if (portal.demo) return NextResponse.json(DEMO_RESULTS);
    if (!portal.clientId) {
      return NextResponse.json({ hasData: false, totals: { spend: 0, impressions: 0, clicks: 0, cpc: 0, leads: 0, cpl: 0, convRate: 0 }, daily: [], campaigns: [], terms: [] });
    }
    return NextResponse.json(await loadResults(portal.clientId, days));
  }

  // view=leads
  if (portal.demo) {
    return NextResponse.json({ name: portal.name, demo: true, rows: DEMO_ROWS, stats: DEMO_STATS });
  }
  const data = await loadFunnel(days, process.env.APP_BASE_URL ?? url.origin);
  return NextResponse.json({ name: portal.name, demo: false, ...data });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const name = str(body.name);
  if (!name) return NextResponse.json({ error: "חסר שם" }, { status: 400 });
  const stage = str(body.stage) || "חדש";
  if (!CUSTOMER_STAGES.includes(stage)) return NextResponse.json({ error: "שלב לא מוכר" }, { status: 400 });

  // בדמו מאשרים בלי לשמור — ההדגמה חוזרת נקייה
  if (portal.demo) return NextResponse.json({ ok: true, customer: { id: `dc-tmp-${Date.now()}`, name, business: str(body.business), email: str(body.email), phone: str(body.phone, 50), stage, paid: false, amountPaid: 0, monthlyFee: 0, notes: str(body.notes, 2000), createdAt: new Date().toISOString() } });

  const customer = await prisma.portalCustomer.create({
    data: {
      portalId: portal.id, name,
      business: str(body.business), email: str(body.email), phone: str(body.phone, 50),
      stage, notes: str(body.notes, 2000),
      sourceChatId: str(body.sourceChatId, 40) || null,
    },
  });
  return NextResponse.json({ ok: true, customer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const id = str(body.id, 40);
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  // עדכון לקוח
  if (body.kind === "customer") {
    const data: Record<string, unknown> = {};
    if (typeof body.stage === "string") {
      if (!CUSTOMER_STAGES.includes(body.stage)) return NextResponse.json({ error: "שלב לא מוכר" }, { status: 400 });
      data.stage = body.stage;
    }
    if (typeof body.paid === "boolean") data.paid = body.paid;
    if (body.amountPaid !== undefined) data.amountPaid = num(body.amountPaid);
    if (body.monthlyFee !== undefined) data.monthlyFee = num(body.monthlyFee);
    if (typeof body.notes === "string") data.notes = body.notes.trim().slice(0, 2000);
    if (typeof body.name === "string" && body.name.trim()) data.name = str(body.name);
    if (typeof body.business === "string") data.business = str(body.business);
    if (typeof body.phone === "string") data.phone = str(body.phone, 50);
    if (typeof body.email === "string") data.email = str(body.email);

    if (portal.demo) return NextResponse.json({ ok: true });
    const customer = await prisma.portalCustomer.updateMany({ where: { id, portalId: portal.id }, data: data as never });
    if (customer.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // עדכון סטטוס ליד במשפך
  const funnelStatus = typeof body.funnelStatus === "string" ? body.funnelStatus.trim().slice(0, 40) : null;
  if (funnelStatus === null || (funnelStatus !== "" && !FUNNEL_STATUS_OPTIONS.includes(funnelStatus))) {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (portal.demo) return NextResponse.json({ ok: true, funnelStatus });
  const chat = await prisma.prospectChat.update({ where: { id }, data: { funnelStatus } }).catch(() => null);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, funnelStatus });
}
