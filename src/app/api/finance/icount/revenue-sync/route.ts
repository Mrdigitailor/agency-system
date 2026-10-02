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
const CREDIT_DOCTYPES = new Set(["refund"]); // חשבונית זיכוי — נספרת שלילי

async function fetchDocs(account: Acc, doctype: string): Promise<Array<Record<string, unknown>>> {
  // doc/search: המסמכים תחת results_list, תקרת עמוד 100 (max_results של iCount)
  const out: Array<Record<string, unknown>> = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 100; page++) {
    const res = await icountRequest<{ results_list?: unknown; results_count?: number }>(
      "doc", "search", { doctype, limit, offset }, { account },
    );
    const arr = Array.isArray(res.results_list) ? (res.results_list as Array<Record<string, unknown>>) : [];
    out.push(...arr);
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

  // ===== מצב חקירה: סוגי מסמכים + שדות לדוגמה (עמיד לכשלים) =====
  if (searchParams.get("mode") === "explore") {
    const out: Record<string, unknown> = {};
    try {
      const types = await icountRequest<{ doctypes?: unknown }>("doc", "types");
      const dt = types.doctypes;
      out.typeList = dt && typeof dt === "object"
        ? Object.entries(dt as Record<string, unknown>).map(([k, v]) => {
            const o = v as Record<string, unknown>;
            return `${k}: ${typeof o === "object" && o ? (o.doctype_name ?? o.name ?? JSON.stringify(o).slice(0, 50)) : String(v)}`;
          })
        : [JSON.stringify(dt)?.slice(0, 300)];
    } catch (e) { out.typesError = e instanceof Error ? e.message : "unknown"; }

    const attempts: Array<[string, string, Record<string, unknown>]> = [
      ["doc/search (invoice)", "search", { doctype: "invoice", limit: 2, detail_level: 1 }],
      ["doc/search (בלי doctype)", "search", { limit: 2 }],
      ["doc/list", "list", { limit: 2 }],
      ["doc/get_list", "get_list", { limit: 2 }],
    ];
    const samples: Record<string, unknown> = {};
    for (const [label, method, params] of attempts) {
      try {
        const sample = await icountRequest<Record<string, unknown>>("doc", method, params);
        const topKeys = Object.keys(sample).filter((k) => k !== "status");
        const raw = sample.results ?? sample.docs ?? sample.list ?? sample.data;
        const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
        samples[label] = {
          topKeys,
          count: arr.length,
          docKeys: arr.length ? Object.keys(arr[0] as Record<string, unknown>) : [],
        };
      } catch (e) {
        samples[label] = { error: e instanceof Error ? e.message : "unknown" };
      }
    }
    out.samples = samples;
    return NextResponse.json(out);
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
        // מדלגים על מסמכים מבוטלים / מסמכי-ביטול — לא הכנסה
        if (d.is_cancelled || d.is_cancellation) continue;
        const icountClientId = String(d.client_id ?? "");
        const clientId = linkByKey.get(`${account}|${icountClientId}`);
        if (!clientId) continue;
        // total במטבע המסמך; מטבע זר מומר לש"ח לפי שער המסמך (rate)
        const rate = parseFloat(String(d.rate ?? 1)) || 1;
        const isIls = String(d.currency_code ?? d.currency ?? "ILS").toUpperCase().includes("ILS") || String(d.currency ?? "").includes("₪");
        const amount = (parseFloat(String(d.total ?? 0)) || 0) * (isIls ? 1 : rate) * sign;
        const date = String(d.dateissued ?? "").slice(0, 10);
        const e = agg.get(clientId) ?? { totalNet: 0, totalGross: 0, yearNet: 0, docCount: 0, firstDocDate: "", lastDocDate: "" };
        e.totalNet += amount;
        e.totalGross += amount;
        if (date.startsWith(thisYear)) e.yearNet += amount;
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
