import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Dispatcher — מפזר סנכרון לכל חיבור כ-invocation נפרד שרץ במקביל
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PLATFORM_PATH: Record<string, string> = {
  meta: "meta",
  google_ads: "google-ads",
  tiktok: "tiktok",
};

/**
 * GET /api/cron/sync-all — סנכרון יומי מלא של כל חשבונות המודעות.
 * רץ ב-08:00; כל חיבור מסונכרן כקריאת HTTP נפרדת (invocation משלה) במקביל,
 * כך שכל החשבונות מתעדכנים תוך דקות.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  const querySecret = new URL(req.url).searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== expected && querySecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // כל חיבור פרסום פעיל של לקוח פעיל
  const connections = await prisma.platformConnection.findMany({
    where: {
      isActive: true,
      platform: { in: ["meta", "google_ads", "tiktok"] },
      client: { deletedAt: null, status: { not: "inactive" } },
    },
    select: { clientId: true, platform: true },
  });

  const origin = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const daysBack = 14;

  // יורים את כל הסנכרונים מיד (כל אחד invocation נפרד שרץ עד הסוף בנפרד).
  // ממתינים עד SOFT_LIMIT כדי להחזיר תשובה נקייה לפני מגבלת 60ש' — סנכרונים שלא
  // הספיקו ממשיכים ברקע כ-invocations עצמאיים (Vercel לא מבטל אותם).
  const SOFT_LIMIT_MS = 45_000;
  const dispatch = Promise.allSettled(
    connections.map((c) =>
      fetch(`${origin}/api/platforms/${PLATFORM_PATH[c.platform]}/sync/${c.clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${expected ?? ""}` },
        body: JSON.stringify({ daysBack }),
      }).then((r) => r.ok),
    ),
  );

  const timeout = new Promise<"timeout">((res) => setTimeout(() => res("timeout"), SOFT_LIMIT_MS));
  const raced = await Promise.race([dispatch, timeout]);
  const succeeded = Array.isArray(raced) ? raced.filter((r) => r.status === "fulfilled" && r.value === true).length : null;

  console.log(`[Cron sync-all] dispatched ${connections.length} connections | completed=${succeeded ?? "in-progress"}`);
  return NextResponse.json({ ok: true, dispatched: connections.length, completed: succeeded });
}
