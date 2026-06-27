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
  // תמיד מסנכרנים את כל החודש הקלנדרי הנוכחי (1 בחודש → היום), כי כך מוגדרים תקציבים ויעדים
  const daysBack = new Date().getDate();

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

  // התראה: חשבונות שדורשים חיבור מחדש (טוקן מת = לא יכולים להסתנכרן)
  await alertBrokenConnections();

  console.log(`[Cron sync-all] dispatched ${connections.length} connections | completed=${succeeded ?? "in-progress"}`);
  return NextResponse.json({ ok: true, dispatched: connections.length, completed: succeeded });
}

/** יוצר התראה (פעם ביום) על חיבורים שטוקן שלהם מת — דורשים חיבור מחדש */
async function alertBrokenConnections() {
  const conns = await prisma.platformConnection.findMany({
    where: { isActive: true, platform: { in: ["meta", "google_ads", "tiktok"] }, client: { deletedAt: null, status: { not: "inactive" } } },
    select: { platform: true, refreshToken: true, tokenExpiry: true, client: { select: { name: true } } },
  });
  const now = Date.now();
  const broken = conns.filter((c) =>
    c.platform === "meta" ? (c.tokenExpiry ? new Date(c.tokenExpiry).getTime() < now : false) : !c.refreshToken,
  );
  if (broken.length === 0) return;

  // de-dup — התראה אחת ביום
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.alert.findFirst({ where: { type: "sync_reconnect", createdAt: { gte: todayStart } } });
  if (existing) return;

  const names = [...new Set(broken.map((b) => `${b.client?.name ?? "?"} (${b.platform})`))].slice(0, 25).join(", ");
  await prisma.alert.create({
    data: {
      type: "sync_reconnect",
      title: `${broken.length} חשבונות דורשים חיבור מחדש`,
      message: `החשבונות הבאים לא הסתנכרנו (טוקן פג): ${names}`,
      link: "/clients",
      userId: null,
    },
  });
}
