// תיאום פגישות למתעניינים — דרך עמוד קביעת הפגישות של גוגל של סער.
// אנחנו לא בונים ממשק תיאום משלנו: הכפתור בדוח מפנה לעמוד של גוגל,
// והסורק כאן מזהה מי קבע בפועל לפי התאמת אימייל המשתתפים ביומן.
import { prisma } from "@/lib/db/prisma";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";

// עמוד "פגישת ניתוח שיווק, 30 דק׳ (ייעוץ בחינם)" של סער
export const BOOKING_URL = "https://calendar.app.google/pJbKFo2GSiACVTkj7";

/** רענון טוקן יומן אם פג — אותו דפוס כמו ב-API של היומן */
async function freshCalendarToken(): Promise<string | null> {
  const conn = await prisma.googleCalendarConnection.findFirst({ where: { refreshToken: { not: "" } } });
  if (!conn) return null;
  if (conn.tokenExpiry && conn.tokenExpiry > new Date()) return conn.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) { console.error("[BookingScan] token refresh failed"); return null; }
  await prisma.googleCalendarConnection.update({
    where: { id: conn.id },
    data: { accessToken: data.access_token, tokenExpiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null },
  });
  return data.access_token as string;
}

/**
 * סריקת קביעות: מצליב אירועים ביומן (60 יום קדימה) מול אימיילים של מתעניינים
 * שעדיין לא סומנו כקובעים. התאמה ← סימון + הודעת טלגרם. best-effort, לא זורק.
 */
export async function scanBookings(): Promise<number> {
  try {
    const pending = await prisma.potentialReport.findMany({
      where: { contactEmail: { not: "" }, bookedAt: null },
      select: { id: true, contactEmail: true, businessName: true, serviceField: true },
    });
    if (pending.length === 0) return 0;

    const token = await freshCalendarToken();
    if (!token) return 0;

    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeMin: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      timeMax: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
    });
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const events = (data.items ?? []) as Array<{
      start?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string }>;
      summary?: string;
    }>;

    // מפת אימייל משתתף ← מועד האירוע הקרוב ביותר
    const byEmail = new Map<string, string>();
    for (const ev of events) {
      const start = ev.start?.dateTime ?? ev.start?.date;
      if (!start) continue;
      for (const a of ev.attendees ?? []) {
        const email = (a.email ?? "").toLowerCase().trim();
        if (email && !byEmail.has(email)) byEmail.set(email, start);
      }
    }

    let matched = 0;
    for (const p of pending) {
      const start = byEmail.get(p.contactEmail.toLowerCase().trim());
      if (!start) continue;
      await prisma.potentialReport.update({
        where: { id: p.id },
        data: { bookedAt: new Date(), meetingAt: new Date(start) },
      });
      matched++;
      const chat = ownerChatId();
      if (chat) {
        const when = new Date(start).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        sendTelegramMessage(chat, `📅 ${p.businessName || p.serviceField} קבע פגישה! ${when}`).catch(() => {});
      }
    }
    return matched;
  } catch (err) {
    console.error("[BookingScan] failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}
