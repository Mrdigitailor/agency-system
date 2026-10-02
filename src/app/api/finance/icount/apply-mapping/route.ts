import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { icountRequest } from "@/lib/api/icount/client";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/finance/icount/apply-mapping — שמירת מיפוי מאושר של לקוח-מערכת ← כרטיס iCount.
 * Body: { pairs: Array<{ system: string; icount: string; account?: "primary"|"old" }> }
 * השרת מאתר את מזהה הכרטיס באייקאונט לפי שם (מנורמל) ושומר IcountLink. קריאה חוזרת = upsert.
 */

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/["'`׳״’]/g, "")
    .replace(/[.,\-_/|()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  const isCron = Boolean(process.env.CRON_SECRET && provided === process.env.CRON_SECRET);
  if (!isCron) {
    const auth = await requireRole(["admin"]);
    if (auth instanceof NextResponse) return auth;
  }

  const body = await req.json().catch(() => ({}));
  const pairs: Array<{ system: string; icount: string; account?: string }> = body.pairs ?? [];
  if (!pairs.length) return NextResponse.json({ error: "חסר pairs" }, { status: 400 });

  // רשימת כרטיסים לכל חשבון שנדרש בזוגות
  const accountsNeeded = [...new Set(pairs.map((p) => p.account ?? "primary"))] as Array<"primary" | "old">;
  const listByAccount = new Map<string, Array<{ id: string; name: string }>>();
  for (const acc of accountsNeeded) {
    const res = await icountRequest<{ clients?: unknown }>("client", "get_list", { limit: 500 }, { account: acc });
    const raw = res.clients;
    listByAccount.set(acc, (Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [])
      .map((c) => {
        const o = c as Record<string, unknown>;
        return { id: String(o.client_id ?? o.id ?? ""), name: String(o.client_name ?? o.name ?? "") };
      })
      .filter((c) => c.id && c.name));
  }

  const systemClients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  const created: string[] = [];
  const failures: string[] = [];

  for (const p of pairs) {
    const account0 = p.account ?? "primary";
    const sys = systemClients.find((c) => norm(c.name) === norm(p.system));
    const ic = (listByAccount.get(account0) ?? []).find((c) => norm(c.name) === norm(p.icount));
    if (!sys) { failures.push(`לקוח מערכת לא נמצא: "${p.system}"`); continue; }
    if (!ic) { failures.push(`כרטיס iCount לא נמצא: "${p.icount}"`); continue; }
    const account = account0;
    await prisma.icountLink.upsert({
      where: { account_icountClientId: { account, icountClientId: ic.id } },
      update: { clientId: sys.id, icountClientName: ic.name },
      create: { clientId: sys.id, account, icountClientId: ic.id, icountClientName: ic.name },
    });
    created.push(`${sys.name} ← ${ic.name}`);
  }

  const total = await prisma.icountLink.count();
  return NextResponse.json({ ok: true, linked: created.length, failures, totalLinks: total, links: created });
}
