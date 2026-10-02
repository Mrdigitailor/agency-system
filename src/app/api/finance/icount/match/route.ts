import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { icountRequest } from "@/lib/api/icount/client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/icount/match — הצלבת לקוחות iCount מול לקוחות המערכת (קריאה בלבד).
 * מושך משני חשבונות: הראשי (טוקן, הבע"מ) והמשני (cid/user/pass, העוסק-מורשה הישן).
 * מחזיר: התאמות (עם ציון ביטחון), לקוחות מערכת בלי התאמה, לקוחות iCount בלי התאמה.
 */

interface IcountClient {
  id: string;
  name: string;
  email: string;
  account: string; // שם החברה באייקאונט שממנה הגיע
}

/** נרמול שם להשוואה — בלי גרשיים/פיסוק/סיומות תאגיד, רווחים מכווצים */
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/["'`׳״’]/g, "")
    .replace(/\b(בע"מ|בעמ|ltd|inc)\b/g, "")
    .replace(/[.,\-_/|()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  if (!at.length || !bt.length) return 0;
  const hits = at.filter((t) => bt.some((x) => x === t || x.includes(t) || t.includes(x))).length;
  return (hits / Math.max(at.length, bt.length)) * 0.85;
}

/** מושך את רשימת הלקוחות מחשבון iCount אחד; מחזיר null אם החשבון לא זמין */
async function fetchAccountClients(forceLogin: boolean): Promise<{ account: string; clients: IcountClient[] } | null> {
  try {
    const info = await icountRequest<{ company_info?: { company_name?: string; name?: string } }>(
      "company", "info", {}, { forceLogin });
    const accountName =
      info.company_info?.company_name ?? info.company_info?.name ?? (forceLogin ? "חשבון משני" : "חשבון ראשי");

    const res = await icountRequest<{ clients?: unknown; clients_count?: number }>(
      "client", "get_list", { limit: 500 }, { forceLogin });
    const raw = res.clients;
    const arr: Record<string, unknown>[] = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : raw && typeof raw === "object"
        ? (Object.values(raw) as Record<string, unknown>[])
        : [];

    const clients: IcountClient[] = arr.map((c) => ({
      id: String(c.client_id ?? c.id ?? ""),
      name: String(c.client_name ?? c.name ?? ""),
      email: String(c.email ?? ""),
      account: accountName,
    })).filter((c) => c.name);

    return { account: accountName, clients };
  } catch (e) {
    console.error(`[icount match] account fetch failed (forceLogin=${forceLogin}):`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function GET(req: Request) {
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = Boolean(process.env.CRON_SECRET && provided === process.env.CRON_SECRET);
  if (!isCron) {
    const auth = await requireRole(["admin"]);
    if (auth instanceof NextResponse) return auth;
  }

  // שני החשבונות במקביל: ראשי (טוקן) + משני (התחברות)
  const [primary, secondary] = await Promise.all([
    fetchAccountClients(false),
    fetchAccountClients(true),
  ]);
  const accounts = [primary, secondary].filter(Boolean) as Array<{ account: string; clients: IcountClient[] }>;
  const icountClients = accounts.flatMap((a) => a.clients);

  const systemClients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, status: true, contactEmail: true },
    orderBy: { name: "asc" },
  });

  // הצלבה: לכל לקוח מערכת — ההתאמות הטובות ביותר מאייקאונט (מייל זהה = ודאי; אחרת שם)
  const matches: Array<{ systemClient: string; status: string; icountName: string; icountAccount: string; icountId: string; confidence: number; via: string }> = [];
  const matchedIcountKeys = new Set<string>();
  const unmatchedSystem: Array<{ name: string; status: string }> = [];

  for (const sc of systemClients) {
    let best: { c: IcountClient; score: number; via: string } | null = null;
    for (const ic of icountClients) {
      let score = 0, via = "name";
      if (sc.contactEmail && ic.email && sc.contactEmail.toLowerCase() === ic.email.toLowerCase()) {
        score = 1; via = "email";
      } else {
        score = similarity(norm(sc.name), norm(ic.name));
      }
      if (!best || score > best.score) best = { c: ic, score, via };
    }
    if (best && best.score >= 0.6) {
      matches.push({
        systemClient: sc.name, status: sc.status,
        icountName: best.c.name, icountAccount: best.c.account, icountId: best.c.id,
        confidence: Math.round(best.score * 100), via: best.via,
      });
      matchedIcountKeys.add(`${best.c.account}|${best.c.id}`);
    } else {
      unmatchedSystem.push({ name: sc.name, status: sc.status });
    }
  }

  const unmatchedIcount = icountClients
    .filter((ic) => !matchedIcountKeys.has(`${ic.account}|${ic.id}`))
    .map((ic) => ({ name: ic.name, account: ic.account }));

  return NextResponse.json({
    accounts: accounts.map((a) => ({ name: a.account, clients: a.clients.length })),
    secondaryAccountAvailable: Boolean(secondary),
    matches,
    unmatchedSystem,
    unmatchedIcount,
  });
}
