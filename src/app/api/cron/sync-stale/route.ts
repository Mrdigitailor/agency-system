import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { dayOfMonthIL } from "@/lib/utils/ildate";
import { syncClientMeta } from "@/lib/api/meta/sync";
import { syncClientGoogleAds } from "@/lib/api/google-ads/sync";
import { syncClientTikTok } from "@/lib/api/tiktok/sync";

// ה-workhorse האמין: רץ כל שעה, מסנכרן כל חיבור שלא רוענן לאחרונה,
// וממתין באמת לכל סנכרון (בלי fire-and-forget). maxDuration מקסימלי של Vercel Pro.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const STALE_MINUTES = 90; // חיבור שלא סונכרן 90 דק' → מרעננים
const CONCURRENCY = 5;

/**
 * GET /api/cron/sync-stale — סנכרון אמין של כל חיבור "מיושן".
 * שלא כמו sync-all (שיורה בקשות ברקע ולא ממתין), כאן קוראים לפונקציות הסנכרון
 * ישירות ומחכים לסיומן, כך ששום כשל לא "נעלם". רץ כל שעה → נתונים אף פעם לא
 * מתיישנים ביותר משעה-שעתיים, גם אם ההרצה היומית פספסה חשבונות.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.cronRun.create({ data: { job: "sync-stale", detail: new URL(req.url).searchParams.get("src") ?? "cron" } }).catch(() => {});

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
  const connections = await prisma.platformConnection.findMany({
    where: {
      isActive: true,
      platform: { in: ["meta", "google_ads", "tiktok"] },
      client: { deletedAt: null, status: { not: "inactive" } },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    // הכי מיושנים קודם — שאם נגמר הזמן, מי שהכי צריך רוענן
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    select: { clientId: true, platform: true, client: { select: { name: true } } },
  });

  const daysBack = dayOfMonthIL(); // כל החודש הקלנדרי הנוכחי
  const results = { ok: 0, failed: 0, errors: [] as string[] };

  // עיבוד בב. concurrency מוגבל — ממתינים לכל סנכרון (דטרמיניסטי, לא ברקע)
  let idx = 0;
  async function worker() {
    while (idx < connections.length) {
      const c = connections[idx++];
      try {
        if (c.platform === "meta") await syncClientMeta(c.clientId, daysBack, false, { campaignsOnly: true });
        else if (c.platform === "google_ads") await syncClientGoogleAds(c.clientId, daysBack, { skipSearchTerms: true });
        else if (c.platform === "tiktok") await syncClientTikTok(c.clientId, daysBack);
        results.ok++;
      } catch (err) {
        results.failed++;
        const msg = `${c.client?.name ?? c.clientId}/${c.platform}: ${err instanceof Error ? err.message : "unknown"}`;
        results.errors.push(msg);
        console.error(`[sync-stale] ${msg}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, connections.length) }, worker));

  console.log(`[sync-stale] stale=${connections.length} ok=${results.ok} failed=${results.failed}`);
  return NextResponse.json({ ok: true, stale: connections.length, synced: results.ok, failed: results.failed, errors: results.errors.slice(0, 10) });
}
