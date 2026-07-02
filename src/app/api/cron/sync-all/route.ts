import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { dayOfMonthIL } from "@/lib/utils/ildate";
import { exchangeForLongLivedToken } from "@/lib/api/meta/oauth";

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
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // heartbeat — רישום שהריצה קרתה (לניטור ול-self-healing מ-sync-meta)
  await prisma.cronRun.create({ data: { job: "sync-all", detail: new URL(req.url).searchParams.get("src") ?? "cron" } }).catch(() => {});

  // רענון אוטומטי של טוקני Meta שעומדים לפוג — כשל כאן לעולם לא מפיל את הסנכרון
  const refreshed = await refreshExpiringMetaTokens().catch((e) => { console.error("[Cron sync-all] token refresh failed:", e); return 0; });

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
  // תמיד מסנכרנים את כל החודש הקלנדרי הנוכחי (1 בחודש → היום, שעון ישראל)
  const daysBack = dayOfMonthIL();

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

  // התראה: חשבונות שלא הסתנכרנו יותר מיממה (כנראה דורשים חיבור מחדש) — כשל לא מפיל
  await alertStaleConnections().catch((e) => console.error("[Cron sync-all] stale alert failed:", e));

  // הערה: ניתוח הבוקר (detect) רץ עכשיו ב-cron עצמאי ב-05:20 — לא מופעל מכאן (מונע ריצה כפולה)

  console.log(`[Cron sync-all] dispatched ${connections.length} connections | completed=${succeeded ?? "in-progress"} | refreshed tokens=${refreshed}`);
  return NextResponse.json({ ok: true, dispatched: connections.length, completed: succeeded, refreshedTokens: refreshed });
}

/**
 * מרענן טוקני Meta long-lived שעדיין תקפים אך פגים תוך 30 יום — מחליף אותם
 * בטוקן 60-יום טרי (fb_exchange_token) בלי שום פעולה ידנית. טוקן שכבר פג לא
 * ניתן לרענן ודורש חיבור מחדש (תופס ע"י alertStaleConnections). מחזיר כמה רוענן.
 */
async function refreshExpiringMetaTokens(): Promise<number> {
  const now = Date.now();
  const horizon = new Date(now + 30 * 24 * 60 * 60 * 1000); // פג תוך 30 יום
  // כולל גם טוקנים שכבר "פגו" — חלקם מסומנים פג בטעות (epoch) ע"י כשל סנכרון
  // אך הטוקן עדיין תקין; ניסיון ההמרה יחייה אותם. טוקן מת באמת ייכשל בעדינות.
  const conns = await prisma.platformConnection.findMany({
    where: {
      platform: "meta",
      isActive: true,
      accessToken: { not: "" },
      client: { deletedAt: null, status: { not: "inactive" } },
      tokenExpiry: { lt: horizon },
    },
    select: { id: true, accessToken: true, client: { select: { name: true } } },
  });
  if (conns.length === 0) return 0;

  let refreshed = 0;
  for (const c of conns) {
    try {
      const fresh = await exchangeForLongLivedToken(c.accessToken);
      if (fresh?.access_token) {
        const expiresIn = fresh.expires_in ?? 5184000; // 60 ימים ברירת מחדל
        await prisma.platformConnection.update({
          where: { id: c.id },
          data: { accessToken: fresh.access_token, tokenExpiry: new Date(now + expiresIn * 1000) },
        });
        refreshed++;
        console.log(`[Cron refresh-meta] ✅ ${c.client?.name} — חודש ל-${Math.round(expiresIn / 86400)} ימים`);
      } else {
        console.warn(`[Cron refresh-meta] ⚠️ ${c.client?.name} — רענון נכשל (יידרש חיבור מחדש בקרוב)`);
      }
    } catch (err) {
      console.error(`[Cron refresh-meta] ${c.client?.name} שגיאה:`, err instanceof Error ? err.message : err);
    }
  }
  return refreshed;
}

/**
 * יוצר התראה (פעם ביום) על חיבורים שלא הסתנכרנו יותר מ-25 שעות — כלומר פספסו
 * את הסנכרון היומי (כשל אמיתי, בד"כ טוקן שדורש חיבור מחדש). מבוסס lastSyncAt
 * ולא תוקף-טוקן, כדי לא לסמן בטעות חיבורים שמסתנכרנים בפועל.
 */
async function alertStaleConnections() {
  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const stale = await prisma.platformConnection.findMany({
    where: {
      isActive: true,
      platform: { in: ["meta", "google_ads", "tiktok"] },
      client: { deletedAt: null, status: { not: "inactive" } },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    select: { platform: true, client: { select: { name: true } } },
  });
  if (stale.length === 0) return;

  // de-dup — התראה אחת ביום
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.alert.findFirst({ where: { type: "sync_reconnect", createdAt: { gte: todayStart } } });
  if (existing) return;

  const names = [...new Set(stale.map((b) => `${b.client?.name ?? "?"} (${b.platform})`))].slice(0, 25).join(", ");
  await prisma.alert.create({
    data: {
      type: "sync_reconnect",
      title: `${stale.length} חשבונות לא הסתנכרנו — ייתכן שדורשים חיבור מחדש`,
      message: `החשבונות הבאים לא הסתנכרנו מעל 24 שעות: ${names}`,
      link: "/clients",
      userId: null,
    },
  });
}
