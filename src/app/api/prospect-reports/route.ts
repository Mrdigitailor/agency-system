// דוחות פוטנציאל — יצירה והרצה (פנימי, admin/manager בלבד).
// POST: קלט מתעניין ← מחקר חי ← שרשרת ← דוח מוכן עם קישור שיתוף.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { runResearch } from "@/lib/prospect/research";
import { computeChain } from "@/lib/prospect/verdict";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";
import { scanBookings } from "@/lib/prospect/booking";

export const maxDuration = 60; // מחקר חי לוקח 10-25 שניות

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

export async function GET(req: Request) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  await scanBookings(); // זיהוי קביעות חדשות מהיומן — best-effort
  const rows = await prisma.potentialReport.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return NextResponse.json(rows.map((r) => {
    let headline = "";
    try {
      const c = JSON.parse(r.chain);
      if (c?.ok) headline = `${Math.round(c.revenueFirst.head).toLocaleString("he-IL")} עד ${Math.round(c.revenueFirst.best).toLocaleString("he-IL")} ₪`;
    } catch { /* דוח בלי שרשרת */ }
    return {
      id: r.id, status: r.status, businessName: r.businessName, serviceField: r.serviceField,
      budget: r.budget, headline, error: r.error,
      link: `${origin}/report/${r.token}`, createdAt: r.createdAt, meetingAt: r.meetingAt,
    };
  }));
}

export async function POST(req: Request) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const serviceField = str(body.serviceField, 200);
  if (!serviceField) return NextResponse.json({ error: "חסר תחום/שירות" }, { status: 400 });
  const budget = num(body.budget);
  if (!budget) return NextResponse.json({ error: "חסר תקציב פרסום" }, { status: 400 });

  const paymentType = body.paymentType === "retainer" ? "retainer" : "one_time";
  const report = await prisma.potentialReport.create({
    data: {
      businessName: str(body.businessName, 200),
      serviceField,
      serviceArea: str(body.serviceArea, 200),
      budget,
      paymentType,
      dealFirst: num(body.dealFirst),
      monthlyFee: paymentType === "retainer" ? num(body.monthlyFee) : 0,
      lifetimeMonths: Math.min(Math.max(Math.round(num(body.lifetimeMonths)) || 12, 1), 120),
      contactName: str(body.contactName, 200),
      contactPhone: str(body.contactPhone, 50),
      contactEmail: str(body.contactEmail, 200).toLowerCase(),
    },
  });

  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const link = `${origin}/report/${report.token}`;

  try {
    const research = await runResearch(report.serviceField, report.serviceArea);
    const chain = computeChain(research, {
      budget: report.budget,
      dealFirst: report.dealFirst,
      monthlyFee: report.monthlyFee,
      lifetimeMonths: report.lifetimeMonths,
    });
    await prisma.potentialReport.update({
      where: { id: report.id },
      data: {
        status: chain.ok ? "ready" : "no_data",
        error: chain.ok ? "" : (chain.reason ?? ""),
        research: JSON.stringify(research),
        chain: JSON.stringify(chain),
      },
    });

    // עדכון לבעלים בטלגרם (best-effort)
    const chat = ownerChatId();
    if (chat) {
      const who = report.businessName || report.serviceField;
      const msg = chain.ok
        ? `📊 דוח פוטנציאל מוכן: ${who}\nפוטנציאל: ${Math.round(chain.revenueFirst.head).toLocaleString("he-IL")} עד ${Math.round(chain.revenueFirst.best).toLocaleString("he-IL")} ₪ בחודש\n${link}`
        : `📊 דוח פוטנציאל: ${who}\nאין מספיק נתונים (${chain.reason}). מומלץ מסלול שיחה.\n${link}`;
      sendTelegramMessage(chat, msg).catch(() => {});
    }

    return NextResponse.json({ token: report.token, link, status: chain.ok ? "ready" : "no_data", reason: chain.ok ? undefined : chain.reason });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "research failed";
    await prisma.potentialReport.update({ where: { id: report.id }, data: { status: "failed", error: msg.slice(0, 500) } });
    console.error("[PotentialReport] failed:", msg);
    return NextResponse.json({ token: report.token, link, status: "failed", error: "המחקר נכשל, נסו שוב" }, { status: 502 });
  }
}
