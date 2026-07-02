import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { detectAllClients } from "@/lib/performance/detect";
import { diagnoseClient, type Diagnosis } from "@/lib/performance/diagnose";
import { sendDiagnosesForApproval } from "@/lib/performance/approval";
import type { ClientDetection } from "@/lib/performance/detect";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TOP_N = 10; // כמה לקוחות מסומנים לאבחן ב-AI (מקבילי) בכל ריצה

/**
 * GET/POST /api/cron/detect — מנוע זיהוי ירידות + אבחון AI → שליחה לאישור בטלגרם.
 * לא יוצר משימות אוטומטית; המשתמש מאשר כל פעולה. מופעל ע"י sync-all. Auth: CRON_SECRET.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace("Bearer ", "") ?? new URL(req.url).searchParams.get("secret");
  if (!(secret && provided === secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // heartbeat — לניטור ול-self-healing
  await prisma.cronRun.create({ data: { job: "detect", detail: new URL(req.url).searchParams.get("src") ?? "cron" } }).catch(() => {});

  const flagged = await detectAllClients();
  const top = flagged.slice(0, TOP_N);

  const diagnosed = await Promise.all(
    top.map(async (det) => {
      const diag = await diagnoseClient(det);
      return diag ? { det, diag } : null;
    }),
  );
  const items = diagnosed.filter((x): x is { det: ClientDetection; diag: Diagnosis } => x !== null);

  const actionsSent = await sendDiagnosesForApproval(items);

  console.log(`[Cron detect] flagged=${flagged.length} diagnosed=${items.length} actionsSent=${actionsSent}`);
  return NextResponse.json({
    ok: true,
    flagged: flagged.length,
    diagnosed: items.length,
    actionsSent,
    clients: items.map((i) => ({ name: i.det.clientName, score: i.det.score, severity: i.diag.severity, actions: i.diag.actions.length })),
  });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
