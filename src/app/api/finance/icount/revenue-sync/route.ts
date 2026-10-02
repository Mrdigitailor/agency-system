import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { icountRequest } from "@/lib/api/icount/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/icount/revenue-sync — סנכרון הכנסות מ-iCount לכל לקוח מקושר.
 * mode=explore: מחזיר סוגי מסמכים + שדות מסמך לדוגמה (לפיתוח, בלי נתונים אישיים).
 * ברירת מחדל: מושך את כל מסמכי ההכנסה משני החשבונות, מסכם פר-לקוח ושומר ב-IcountRevenue.
 */

type Acc = "primary" | "old";

/** סוגי מסמכים שנספרים כהכנסה. זיכוי נספר שלילי. */
const REVENUE_DOCTYPES = new Set(["invoice", "invrec"]);
const CREDIT_DOCTYPES = new Set(["refund", "credit_invoice", "creditnote"]);

async function fetchDocs(account: Acc, doctype: string): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let offset = 0;
  const limit = 500;
  for (let page = 0; page < 40; page++) {
    const res = await icountRequest<{ results?: unknown; docs?: unknown; list?: unknown }>(
      "doc", "search", { doctype, limit, offset, detail_level: 1 }, { account },
    );
    const raw = res.results ?? res.docs ?? res.list;
    const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    out.push(...(arr as Array<Record<string, unknown>>));
    if (arr.length < limit) break;
    offset += limit;
  }
  return out;
}

export async function GET(req: Request) {
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = Boolean(process.env.CRON_SECRET && provided === process.env.CRON_SECRET);
  if (!isCron) {
    const auth = await requireRole(["admin"]);
    if (auth instanceof NextResponse) return auth;
  }

  const { searchParams } = new URL(req.url);

  // ===== מצב חקירה: סוגי מסמכים + שדות לדוגמה =====
  if (searchParams.get("mode") === "explore") {
    const types = await icountRequest<{ doctypes?: unknown }>("doc", "types");
    const dt = types.doctypes;
    const typeList = dt && typeof dt === "object"
      ? Object.entries(dt as Record<string, unknown>).map(([k, v]) => {
          const o = v as Record<string, unknown>;
          return `${k}: ${o?.doctype_name ?? o?.name ?? JSON.stringify(o).slice(0, 60)}`;
        })
      : [String(dt)];

    const sample = await icountRequest<Record<string, unknown>>(
      "doc", "search", { limit: 2, detail_level: 1 });
    const topKeys = Object.keys(sample).filter((k) => k !== "status");
    const raw = sample.results ?? sample.docs ?? sample.list;
    const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    const docKeys = arr.length ? Object.keys(arr[0] as Record<string, unknown>) : [];

    return NextResponse.json({ typeList, searchTopKeys: topKeys, sampleDocKeys: docKeys, sampleCount: arr.length });
  }

  // ===== סנכרון מלא =====
  const links = await prisma.icountLink.findMany({ select: { clientId: true, account: true, icountClientId: true } });
  const linkByKey = new Map(links.map((l) => [`${l.account}|${l.icountClientId}`, l.clientId]));

  const thisYear = String(new Date().getFullYear());
  const agg = new Map<string, { totalNet: number; totalGross: number; yearNet: number; docCount: number; firstDocDate: string; lastDocDate: string }>();

  const errors: string[] = [];
  for (const account of ["primary", "old"] as Acc[]) {
    for (const doctype of [...REVENUE_DOCTYPES, ...CREDIT_DOCTYPES]) {
      let docs: Array<Record<string, unknown>> = [];
      try {
        docs = await fetchDocs(account, doctype);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        // סוג מסמך שלא קיים בחשבון — לא קריטי
        if (!/doctype|not.?found|invalid/i.test(msg)) errors.push(`${account}/${doctype}: ${msg}`);
        continue;
      }
      const sign = CREDIT_DOCTYPES.has(doctype) ? -1 : 1;
      for (const d of docs) {
        const icountClientId = String(d.client_id ?? d.clientid ?? "");
        const clientId = linkByKey.get(`${account}|${icountClientId}`);
        if (!clientId) continue;
        const net = (parseFloat(String(d.total ?? d.totalsum ?? d.total_sum ?? 0)) || 0) * sign;
        const gross = (parseFloat(String(d.totalwithvat ?? d.total_with_vat ?? d.totalprice ?? d.total ?? 0)) || 0) * sign;
        const date = String(d.doc_date ?? d.docdate ?? d.date ?? "").slice(0, 10);
        const e = agg.get(clientId) ?? { totalNet: 0, totalGross: 0, yearNet: 0, docCount: 0, firstDocDate: "", lastDocDate: "" };
        e.totalNet += net;
        e.totalGross += gross;
        if (date.startsWith(thisYear)) e.yearNet += net;
        if (sign > 0) {
          e.docCount++;
          if (date && (!e.firstDocDate || date < e.firstDocDate)) e.firstDocDate = date;
          if (date && date > e.lastDocDate) e.lastDocDate = date;
        }
        agg.set(clientId, e);
      }
    }
  }

  // שמירה
  let saved = 0;
  for (const [clientId, e] of agg) {
    await prisma.icountRevenue.upsert({
      where: { clientId },
      update: { totalNet: e.totalNet, totalGross: e.totalGross, yearNet: e.yearNet, docCount: e.docCount, firstDocDate: e.firstDocDate, lastDocDate: e.lastDocDate },
      create: { clientId, totalNet: e.totalNet, totalGross: e.totalGross, yearNet: e.yearNet, docCount: e.docCount, firstDocDate: e.firstDocDate, lastDocDate: e.lastDocDate },
    });
    saved++;
  }

  await prisma.cronRun.create({ data: { job: "icount-revenue", detail: isCron ? "cron" : "manual" } }).catch(() => {});
  console.log(`[icount revenue] clients=${saved} errors=${errors.length}`);
  return NextResponse.json({ ok: true, clientsSynced: saved, errors });
}
