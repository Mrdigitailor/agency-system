// הסרה מרשימת התפוצה של מיילי ההמשך. הליד מגיע מהקישור שבתחתית המייל,
// מאשר בלחיצה בדף (ולא בעצם פתיחת הקישור, כי סורקי דואר פותחים קישורים אוטומטית),
// ומאותו רגע לא יקבל מיילי המשך. מיילים תפעוליים כמו תזכורת לפגישה שקבע ממשיכים.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[a-z0-9-]{16,40}$/i.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const report = await prisma.potentialReport.findUnique({ where: { token }, select: { id: true, unsubscribedAt: true } });
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!report.unsubscribedAt) await prisma.potentialReport.update({ where: { id: report.id }, data: { unsubscribedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
