// קרון: בדיקת הקמפיין של המשפך, כל יומיים בבוקר. לכל פורטל פעיל עם חשבון גוגל אדס נשלח מייל לבעל הפורטל.
// Auth: CRON_SECRET, כמו שאר הקרונים.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runCampaignCheck } from "@/lib/prospect/campaign-check";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function run(req: Request) {
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const portals = await prisma.funnelPortal.findMany({ where: { deletedAt: null, ownerEmail: { not: "" } } });
  const out: string[] = [];
  for (const portal of portals) {
    try { out.push(`${portal.name}: ${await runCampaignCheck(portal)}`); }
    catch (err) { out.push(`${portal.name}: שגיאה (${err instanceof Error ? err.message.slice(0, 200) : "לא ידועה"})`); }
  }
  console.log(`[FunnelCampaignCheck] ${out.join(" | ")}`);
  return NextResponse.json({ results: out });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
