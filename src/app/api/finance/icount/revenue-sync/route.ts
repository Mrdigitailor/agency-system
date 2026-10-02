import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { icountRequest } from "@/lib/api/icount/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/icount/revenue-sync — סנכרון הכנסות מ-iCount לכל לקוח מקושר.
 * שולף את כל מסמכי ההכנסה משני החשבונות עם פירוט מע"מ (detail_level=2), שומר כל
 * מסמך ב-IcountDoc, מסכם פר-לקוח ב-IcountRevenue (ללא מע"מ / מע"מ / כולל),
 * ומזין את טבלת ההכנסות החודשית (Income) מהחשבוניות בפועל.
 * mode=call: קריאה גנרית לפיתוח (CRON בלבד, מתודות קריאה בלבד).
 */

type Acc = "primary" | "old";

/** סוגי מסמכים שנספרים כהכנסה. זיכוי נספר שלילי. */
const REVENUE_DOCTYPES = new Set(["invoice", "invrec"]);
const CREDIT_DOCTYPES = new Set(["refund"]); // חשבונית זיכוי — נספרת שלילי

async function fetchDocs(account: Acc, doctype: string): Promise<Array<Record<string, unknown>>> {
  // doc/search: המסמכים תחת results_list, תקרת עמוד 100; detail_level=2 מחזיר פירוט מע"מ
  const out: Array<Record<string, unknown>> = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 100; page++) {
    const res = await icountRequest<{ results_list?: unknown }>(
      "doc", "search", { doctype, limit, offset, detail_level: 2 }, { account },
    );
    const arr = Array.isArray(res.results_list) ? (res.results_list as Array<Record<string, unknown>>) : [];
    out.push(...arr);
    if (arr.length < limit) break;
    offset += limit;
  }
  return out;
}

const num = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

interface ParsedDoc {
  account: Acc;
  doctype: string;
  docnum: string;
  clientId: string;
  dateissued: string;
  beforeVat: number; // ללא מע"מ, בש"ח, חתום (זיכוי שלילי)
  vatAmount: number;
  withVat: number;
  remaining: number; // יתרה שטרם שולמה
}

export async function GET(req: Request) {
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = Boolean(process.env.CRON_SECRET && provided === process.env.CRON_SECRET);
  if (!isCron) {
    const auth = await requireRole(["admin"]);
    if (auth instanceof NextResponse) return auth;
  }

  const { searchParams } = new URL(req.url);

  // ===== מצב קריאה גנרית לצורכי פיתוח (CRON בלבד, מתודות קריאה בלבד) =====
  if (searchParams.get("mode") === "call" && isCron) {
    const ALLOWED = new Set(["doc/search", "doc/types", "doc/info", "client/get_list", "company/info"]);
    const module_ = searchParams.get("module") ?? "";
    const method = searchParams.get("method") ?? "";
    if (!ALLOWED.has(`${module_}/${method}`)) return NextResponse.json({ error: "method לא ברשימה" }, { status: 400 });
    let params: Record<string, unknown> = {};
    try { params = JSON.parse(Buffer.from(searchParams.get("params") ?? "e30=", "base64").toString("utf8")); } catch { /* empty */ }
    const account = (searchParams.get("account") === "old" ? "old" : "primary") as Acc;
    try {
      const data = await icountRequest<Record<string, unknown>>(module_, method, params, { account });
      return NextResponse.json({ ok: true, data });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  // ===== סנכרון מלא =====
  const links = await prisma.icountLink.findMany({ select: { clientId: true, account: true, icountClientId: true } });
  const linkByKey = new Map(links.map((l) => [`${l.account}|${l.icountClientId}`, l.clientId]));

  const errors: string[] = [];
  const parsed: ParsedDoc[] = [];

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
        // מדלגים על מסמכים מבוטלים / מסמכי-ביטול — לא הכנסה
        if (d.is_cancelled || d.is_cancellation) continue;
        const clientId = linkByKey.get(`${account}|${String(d.client_id ?? "")}`);
        if (!clientId) continue;
        // סכומים במטבע המסמך; מטבע זר מומר לש"ח לפי שער המסמך (rate)
        const rate = num(d.rate) || 1;
        const isIls = String(d.currency_code ?? d.currency ?? "ILS").toUpperCase().includes("ILS") || String(d.currency ?? "").includes("₪");
        const fx = isIls ? 1 : rate;
        parsed.push({
          account, doctype,
          docnum: String(d.docnum ?? ""),
          clientId,
          dateissued: String(d.dateissued ?? "").slice(0, 10),
          beforeVat: num(d.totalsum) * fx * sign,
          vatAmount: num(d.totalvat) * fx * sign,
          withVat: num(d.totalwithvat ?? d.total) * fx * sign,
          remaining: num(d.remainingsum) * fx,
        });
      }
    }
  }

  // ---- שמירת המסמכים (החלפה מלאה — המקור הוא iCount) ----
  await prisma.$transaction([
    prisma.icountDoc.deleteMany({}),
    prisma.icountDoc.createMany({
      data: parsed.map((p) => ({
        account: p.account, doctype: p.doctype, docnum: p.docnum, clientId: p.clientId,
        dateissued: p.dateissued, beforeVat: p.beforeVat, vatAmount: p.vatAmount,
        withVat: p.withVat, remaining: p.remaining,
      })),
      skipDuplicates: true,
    }),
  ]);

  // ---- סיכום פר-לקוח ----
  const thisYear = String(new Date().getFullYear());
  interface Agg { totalNet: number; totalVat: number; totalGross: number; yearNet: number; yearVat: number; yearGross: number; docCount: number; firstDocDate: string; lastDocDate: string }
  const agg = new Map<string, Agg>();
  for (const p of parsed) {
    const e = agg.get(p.clientId) ?? { totalNet: 0, totalVat: 0, totalGross: 0, yearNet: 0, yearVat: 0, yearGross: 0, docCount: 0, firstDocDate: "", lastDocDate: "" };
    e.totalNet += p.beforeVat;
    e.totalVat += p.vatAmount;
    e.totalGross += p.withVat;
    if (p.dateissued.startsWith(thisYear)) {
      e.yearNet += p.beforeVat;
      e.yearVat += p.vatAmount;
      e.yearGross += p.withVat;
    }
    if (p.beforeVat >= 0) {
      e.docCount++;
      if (p.dateissued && (!e.firstDocDate || p.dateissued < e.firstDocDate)) e.firstDocDate = p.dateissued;
      if (p.dateissued && p.dateissued > e.lastDocDate) e.lastDocDate = p.dateissued;
    }
    agg.set(p.clientId, e);
  }

  let saved = 0;
  for (const [clientId, e] of agg) {
    await prisma.icountRevenue.upsert({
      where: { clientId },
      update: { ...e },
      create: { clientId, ...e },
    });
    saved++;
  }

  // ---- הזנת טבלת ההכנסות החודשית (Income) מהחשבוניות בפועל ----
  // כל חשבונית = שורה בחודש ההנפקה שלה: סכום ללא מע"מ + מע"מ בנפרד, שולם לפי היתרה.
  let incomeCreated = 0, incomeUpdated = 0;
  try {
    const existing = await prisma.income.findMany({
      where: { icountDocKey: { not: "" } },
      select: { id: true, icountDocKey: true, amount: true, vat: true, paid: true, invoiceDate: true, receiptIssued: true },
    });
    const byKey = new Map(existing.map((r) => [r.icountDocKey, r]));

    // שורות-ריטיינר אוטומטיות שעוד לא חוברו לחשבונית — מועמדות "לאימוץ" במקום שורה כפולה
    const placeholders = await prisma.income.findMany({
      where: { icountDocKey: "", invoiceIssued: false, paid: false, clientId: { not: null } },
      select: { id: true, clientId: true, month: true, year: true },
    });
    const placeholderByClientMonth = new Map(placeholders.map((r) => [`${r.clientId}|${r.year}|${r.month}`, r.id]));

    const names = await prisma.client.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    const nameById = new Map(names.map((c) => [c.id, c.name]));

    for (const p of parsed) {
      if (!p.dateissued) continue;
      const [y, m] = p.dateissued.split("-").map(Number);
      if (!y || !m) continue;
      const key = `${p.account}|${p.doctype}|${p.docnum}`;
      const data = {
        month: m, year: y,
        clientId: p.clientId,
        invoiceIssued: true,
        invoiceDate: p.dateissued,
        amount: Math.round(p.beforeVat * 100) / 100,
        vat: Math.round(p.vatAmount * 100) / 100,
        paid: p.remaining <= 0.01,
        receiptIssued: p.doctype === "invrec",
        automated: true,
        icountDocKey: key,
      };
      const ex = byKey.get(key);
      if (ex) {
        // עדכון רק אם משהו השתנה (למשל חשבונית שנפרעה)
        if (ex.amount !== data.amount || ex.vat !== data.vat || ex.paid !== data.paid || ex.invoiceDate !== data.invoiceDate || ex.receiptIssued !== data.receiptIssued) {
          await prisma.income.update({ where: { id: ex.id }, data });
          incomeUpdated++;
        }
        continue;
      }
      // אימוץ שורת ריטיינר ריקה של אותו לקוח באותו חודש, אם קיימת
      const phKey = `${p.clientId}|${y}|${m}`;
      const phId = placeholderByClientMonth.get(phKey);
      if (phId) {
        await prisma.income.update({ where: { id: phId }, data });
        placeholderByClientMonth.delete(phKey);
        incomeCreated++;
        continue;
      }
      await prisma.income.create({ data: { ...data, clientName: nameById.get(p.clientId) ?? "" } });
      incomeCreated++;
    }
  } catch (e) {
    errors.push(`income-sync: ${e instanceof Error ? e.message : "unknown"}`);
  }

  await prisma.cronRun.create({ data: { job: "icount-revenue", detail: isCron ? "cron" : "manual" } }).catch(() => {});
  console.log(`[icount revenue] clients=${saved} docs=${parsed.length} incomeCreated=${incomeCreated} incomeUpdated=${incomeUpdated} errors=${errors.length}`);
  return NextResponse.json({ ok: true, clientsSynced: saved, docs: parsed.length, incomeCreated, incomeUpdated, errors });
}
