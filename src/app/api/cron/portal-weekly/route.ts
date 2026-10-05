// קרון שבועי של פורטלי הלקוחות (ראשון בבוקר): לכל פורטל פעיל,
// יוצר תובנות מהשיחות של 7 הימים האחרונים ושולח את הדוח השבועי לבעל הפורטל.
// Auth: CRON_SECRET, כמו שאר הקרונים.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateInsights, weeklyNumbers } from "@/lib/prospect/portal-insights";
import { sendWeeklyReport } from "@/lib/prospect/portal-notify";
import { todayIL, shiftYmd } from "@/lib/utils/ildate";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function run(req: Request) {
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // השבוע שהסתיים אתמול: 7 ימים מלאים
  const to = shiftYmd(todayIL(), -1);
  const from = shiftYmd(to, -6);
  const portals = await prisma.funnelPortal.findMany({ where: { deletedAt: null } });
  const out: string[] = [];

  for (const portal of portals) {
    try {
      const insight = await generateInsights(portal, from, to).catch((err) => {
        console.error(`[PortalWeekly] insights failed for ${portal.name}:`, err instanceof Error ? err.message : err);
        return null;
      });
      if (!portal.weeklyReport || !portal.ownerEmail) { out.push(`${portal.name}: insights ${insight ? "ok" : "skipped"}, no report`); continue; }
      const numbers = await weeklyNumbers(portal, from, to, insight);
      // שבוע בלי שום פעילות: לא שולחים דוח ריק
      if (numbers.chats === 0 && numbers.closed === 0 && !numbers.spend) { out.push(`${portal.name}: quiet week, no report`); continue; }
      const sent = await sendWeeklyReport(portal, numbers, from, to);
      out.push(`${portal.name}: report ${sent ? "sent" : "failed"}`);
    } catch (err) {
      out.push(`${portal.name}: error ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  console.log(`[PortalWeekly] ${from}..${to}: ${out.join(" | ") || "no portals"}`);
  return NextResponse.json({ from, to, results: out });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
