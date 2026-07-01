import { NextResponse } from "next/server";
import { detectAllClients } from "@/lib/performance/detect";
import { diagnoseClient, createTasksFromDiagnosis, buildTelegramDigest, sendOwnerDigest, type Diagnosis } from "@/lib/performance/diagnose";
import type { ClientDetection } from "@/lib/performance/detect";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TOP_N = 10; // כמה לקוחות מסומנים לאבחן ב-AI (מקבילי) בכל ריצה

/**
 * GET/POST /api/cron/detect — מנוע זיהוי ירידות + אבחון AI + דיגסט בוקר.
 * מופעל ע"י sync-all (fire-and-forget). Auth: CRON_SECRET.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace("Bearer ", "") ?? new URL(req.url).searchParams.get("secret");
  if (!(secret && provided === secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flagged = await detectAllClients();
  const top = flagged.slice(0, TOP_N);

  const diagnosed = await Promise.all(
    top.map(async (det) => {
      const diag = await diagnoseClient(det);
      if (!diag) return null;
      const tasks = await createTasksFromDiagnosis(det, diag, { dedupeDays: 4 }).catch(() => 0);
      return { det, diag, tasks };
    }),
  );
  const items = diagnosed.filter((x): x is { det: ClientDetection; diag: Diagnosis; tasks: number } => x !== null);

  await sendOwnerDigest(buildTelegramDigest(items.map((i) => ({ det: i.det, diag: i.diag }))));

  console.log(`[Cron detect] flagged=${flagged.length} diagnosed=${items.length} tasks=${items.reduce((s, i) => s + i.tasks, 0)}`);
  return NextResponse.json({
    ok: true,
    flagged: flagged.length,
    diagnosed: items.length,
    tasksCreated: items.reduce((s, i) => s + i.tasks, 0),
    clients: items.map((i) => ({ name: i.det.clientName, score: i.det.score, severity: i.diag.severity, actions: i.diag.actions.length })),
  });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
