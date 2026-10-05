// קרון שעתי — רצף המיילים של משפך דוח הפוטנציאל + זיהוי ביטולי פגישות.
// מסלולים: לא קבע (רצף המשך לפי NURTURE_SCHEDULE) · קבע (תזכורת 24 שעות לפני) · ביטל (מייל החזרה).
// Auth: CRON_SECRET, כמו שאר הקרונים.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendProspectEmail, type EmailKey } from "@/lib/prospect/emails";
import { NURTURE_SCHEDULE } from "@/lib/prospect/email-templates";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const DAY = 24 * 3600_000;
const SEND_WINDOW = 2 * DAY;

async function calendarToken(): Promise<string | null> {
  const conn = await prisma.googleCalendarConnection.findFirst({ where: { refreshToken: { not: "" } } });
  if (!conn) return null;
  if (conn.tokenExpiry && conn.tokenExpiry > new Date()) return conn.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: conn.refreshToken, grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) return null;
  await prisma.googleCalendarConnection.update({
    where: { id: conn.id },
    data: { accessToken: data.access_token, tokenExpiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null },
  });
  return data.access_token as string;
}

async function run(req: Request) {
  const provided = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const sent: string[] = [];

  // דוחות פעילים מהחודש האחרון עם אימייל
  const reports = await prisma.potentialReport.findMany({
    where: { contactEmail: { not: "" }, createdAt: { gte: new Date(now - 30 * DAY) } },
  });

  // --- זיהוי ביטולים: אירוע שנוצר על ידינו ונמחק/בוטל ביומן ---
  const withEvents = reports.filter((r) => r.calendarEventId && r.bookedAt && !r.cancelledAt);
  if (withEvents.length) {
    const token = await calendarToken();
    if (token) {
      for (const r of withEvents) {
        try {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${r.calendarEventId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const cancelled = res.status === 404 || (res.ok && (await res.json()).status === "cancelled");
          if (cancelled) {
            await prisma.potentialReport.update({ where: { id: r.id }, data: { cancelledAt: new Date(), bookedAt: null, meetingAt: null, calendarEventId: "" } });
            if (await sendProspectEmail(r.id, "cancelled")) sent.push(`cancelled→${r.contactEmail}`);
            const chat = ownerChatId();
            if (chat) sendTelegramMessage(chat, `❌ ${r.businessName || r.serviceField} ביטל את הפגישה. נשלח מייל החזרה.`).catch(() => {});
          }
        } catch { /* ננסה בריצה הבאה */ }
      }
    }
  }

  // --- רצפי מיילים ---
  for (const r of reports) {
    const sentKeys: EmailKey[] = (() => { try { return JSON.parse(r.emailsSent || "[]"); } catch { return []; } })();
    const age = now - r.createdAt.getTime();

    // מסלול קבע: תזכורת יום לפני (22-26 שעות) + תזכורת קצרה כשעה לפני
    if (r.meetingAt && !r.cancelledAt) {
      const until = r.meetingAt.getTime() - now;
      if (until > 22 * 3600_000 && until < 26 * 3600_000 && !sentKeys.includes("reminder")) {
        if (await sendProspectEmail(r.id, "reminder")) sent.push(`reminder→${r.contactEmail}`);
      }
      // הקרון רץ כל שעה עגולה, אז חלון של 30-95 דקות תופס בדיוק ריצה אחת לפני הפגישה
      if (until > 30 * 60_000 && until <= 95 * 60_000 && !sentKeys.includes("reminder1h")) {
        if (await sendProspectEmail(r.id, "reminder1h")) sent.push(`reminder1h→${r.contactEmail}`);
      }
      continue; // מי שקבע לא מקבל חימום
    }

    // מסלול לא קבע: חימום לפי גיל הדוח (רק אם הדוח מוכן ומייל הדוח כבר נשלח)
    if (r.status !== "ready" || !sentKeys.includes("report")) continue;
    // התזמון מגיע מהגדרת הרצף. לכל מייל חלון של יומיים: ליד שפספס את החלון
    // (למשל כשמייל חדש נוסף לרצף) לא מקבל אותו באיחור, שלא ייצאו כמה מיילים ברצף.
    const due: Array<[EmailKey, number]> = NURTURE_SCHEDULE.map((n) => [n.key, n.afterDays * DAY]);
    for (const [key, afterMs] of due) {
      if (age >= afterMs && age < afterMs + SEND_WINDOW && !sentKeys.includes(key)) {
        if (await sendProspectEmail(r.id, key)) sent.push(`${key}→${r.contactEmail}`);
        break; // מייל אחד לכל היותר בריצה, שלא יקבל שניים באותה שעה
      }
    }
  }

  console.log(`[ProspectEmails] sent: ${sent.length ? sent.join(", ") : "nothing due"}`);
  return NextResponse.json({ sent });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
