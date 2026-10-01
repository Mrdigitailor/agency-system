import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api-guard";
import { icountRequest, isIcountConfigured } from "@/lib/api/icount/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/finance/icount/status — בדיקת חיבור ל-iCount (אדמין בלבד, קריאה בלבד).
 * מנסה כמה מתודות "קלות" כדי לגלות מה זמין בחשבון ולהחזיר אבחון ברור.
 */
export async function GET() {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  if (!isIcountConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "חסרים פרטי התחברות: הוסף ICOUNT_TOKEN (מומלץ) או ICOUNT_CID+ICOUNT_USER+ICOUNT_PASS ב-Vercel",
    });
  }

  const probes: Array<{ name: string; module: string; method: string; params?: Record<string, unknown> }> = [
    { name: "פרטי חברה", module: "company", method: "info" },
    { name: "רשימת לקוחות", module: "client", method: "get_list" },
    { name: "סוגי מסמכים", module: "doc", method: "types" },
  ];

  const results: Record<string, { ok: boolean; detail: string }> = {};
  for (const p of probes) {
    try {
      const data = await icountRequest(p.module, p.method, p.params ?? {});
      const keys = Object.keys(data).filter((k) => k !== "status").slice(0, 6);
      results[p.name] = { ok: true, detail: `שדות: ${keys.join(", ")}` };
    } catch (e) {
      results[p.name] = { ok: false, detail: e instanceof Error ? e.message : "unknown" };
    }
  }

  const anyOk = Object.values(results).some((r) => r.ok);
  return NextResponse.json({ configured: true, connected: anyOk, probes: results });
}
