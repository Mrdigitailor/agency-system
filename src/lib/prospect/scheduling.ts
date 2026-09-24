// מנוע תיאום פגישות — קורא את היומן של סער, מחשב משבצות פנויות ויוצר את הפגישה בעצמו.
// ככה נפתרת מגבלת הזום של גוגל: את האירוע אנחנו יוצרים, אז הקישור שלנו נכנס בו.
// כללי הזמינות (מסער): ראשון עד חמישי 09:30-16:30, פגישה 30 דק', מרווח 15 דק',
// לפחות 24 שעות מראש, וכל מה שפנוי ביומן אפשרי.
import { prisma } from "@/lib/db/prisma";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";

const TZ = "Asia/Jerusalem";
export const SLOT_MINUTES = 30;
export const BUFFER_MINUTES = 15;
export const MIN_NOTICE_HOURS = 24;
export const HORIZON_DAYS = 14;
const WORK_DAYS = [0, 1, 2, 3, 4]; // ראשון עד חמישי (getDay בשעון ישראל)
const WORK_START = { h: 9, m: 30 };
const WORK_END = { h: 16, m: 30 };

// קישור הזום הקבוע של סער — נכנס לכל הזמנה. ריק = הפגישה נוצרת בלי קישור.
export const ZOOM_LINK = process.env.MEETING_ZOOM_LINK ?? "";

// ---------- עזרי אזור זמן ----------
/** מפרק רגע נתון לרכיבי תאריך ושעה בשעון ישראל */
function ilParts(d: Date): { y: number; mo: number; day: number; h: number; mi: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year), mo: Number(parts.month), day: Number(parts.day),
    h: Number(parts.hour), mi: Number(parts.minute), weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

/** ממיר תאריך+שעה בשעון ישראל ל-Date אמיתי (מטפל בשעון קיץ/חורף) */
function ilToUtc(y: number, mo: number, day: number, h: number, mi: number): Date {
  // ניחוש ראשוני ותיקון לפי ההפרש בפועל של אזור הזמן באותו רגע
  let guess = new Date(Date.UTC(y, mo - 1, day, h, mi));
  for (let i = 0; i < 3; i++) {
    const p = ilParts(guess);
    const diffMin = (p.h * 60 + p.mi + (p.day - day) * 24 * 60) - (h * 60 + mi);
    if (diffMin === 0) break;
    guess = new Date(guess.getTime() - diffMin * 60_000);
  }
  return guess;
}

// ---------- טוקן יומן ----------
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
  if (!data.access_token) return null;
  await prisma.googleCalendarConnection.update({
    where: { id: conn.id },
    data: { accessToken: data.access_token, tokenExpiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null },
  });
  return data.access_token as string;
}

/** חלונות תפוסים מהיומן (freeBusy) לחלון התיאום */
async function getBusyWindows(token: string, from: Date, to: Date): Promise<Array<{ start: number; end: number }>> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: "primary" }] }),
  });
  if (!res.ok) throw new Error(`freeBusy ${res.status}`);
  const data = await res.json();
  const busy = (data.calendars?.primary?.busy ?? []) as Array<{ start: string; end: string }>;
  return busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));
}

export interface Slot { startIso: string; label: string }

/** משבצות פנויות: כל חצי שעה בתוך חלון העבודה, נקיות מאירועים כולל מרווח משני הצדדים */
export async function getFreeSlots(): Promise<Slot[]> {
  const token = await freshCalendarToken();
  if (!token) throw new Error("calendar not connected");

  const now = new Date();
  const from = new Date(now.getTime() + MIN_NOTICE_HOURS * 3600_000);
  const to = new Date(now.getTime() + HORIZON_DAYS * 24 * 3600_000);
  const busy = await getBusyWindows(token, now, to);

  const isFree = (startMs: number) => {
    const a = startMs - BUFFER_MINUTES * 60_000;
    const b = startMs + (SLOT_MINUTES + BUFFER_MINUTES) * 60_000;
    return !busy.some((w) => w.start < b && w.end > a);
  };

  const slots: Slot[] = [];
  const dayFmt = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });
  const timeFmt = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

  for (let d = 0; d <= HORIZON_DAYS; d++) {
    const probe = new Date(now.getTime() + d * 24 * 3600_000);
    const p = ilParts(probe);
    if (!WORK_DAYS.includes(p.weekday)) continue;

    for (let mins = WORK_START.h * 60 + WORK_START.m; mins + SLOT_MINUTES <= WORK_END.h * 60 + WORK_END.m; mins += SLOT_MINUTES) {
      const start = ilToUtc(p.y, p.mo, p.day, Math.floor(mins / 60), mins % 60);
      if (start < from || start > to) continue;
      if (!isFree(start.getTime())) continue;
      slots.push({ startIso: start.toISOString(), label: `${dayFmt.format(start)} · ${timeFmt.format(start)}` });
      if (slots.length >= 40) return slots;
    }
  }
  return slots;
}

/** קביעת פגישה בפועל: אימות שהמשבצת עדיין פנויה ← יצירת אירוע עם הזמנה וזום */
export async function bookSlot(args: {
  startIso: string; name: string; email: string; phone?: string; reportId?: string;
}): Promise<{ ok: boolean; error?: string; meetingAt?: string }> {
  const token = await freshCalendarToken();
  if (!token) return { ok: false, error: "calendar not connected" };

  const start = new Date(args.startIso);
  if (isNaN(start.getTime())) return { ok: false, error: "מועד לא תקין" };
  if (start.getTime() < Date.now() + MIN_NOTICE_HOURS * 3600_000) return { ok: false, error: "המועד קרוב מדי" };

  // אימות אחרון מול היומן — בדיוק לפני היצירה
  const busy = await getBusyWindows(token, new Date(start.getTime() - BUFFER_MINUTES * 60_000), new Date(start.getTime() + (SLOT_MINUTES + BUFFER_MINUTES) * 60_000));
  if (busy.length > 0) return { ok: false, error: "המועד נתפס הרגע, בחרו מועד אחר" };

  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
  const description = [
    `פגישת ניתוח שיווק עם ${args.name}`,
    args.phone ? `טלפון: ${args.phone}` : "",
    ZOOM_LINK ? `\nהצטרפות בזום: ${ZOOM_LINK}` : "",
  ].filter(Boolean).join("\n");

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `פגישת ניתוח שיווק: ${args.name}`,
      description,
      location: ZOOM_LINK || undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: [{ email: args.email, displayName: args.name }],
      reminders: { useDefault: true },
    }),
  });
  if (!res.ok) {
    console.error("[Booking] event create failed:", res.status, (await res.text()).slice(0, 200));
    return { ok: false, error: "יצירת הפגישה נכשלה, נסו שוב" };
  }

  if (args.reportId) {
    await prisma.potentialReport.update({
      where: { id: args.reportId },
      data: { bookedAt: new Date(), meetingAt: start },
    }).catch(() => {});
  }

  const chat = ownerChatId();
  if (chat) {
    const when = start.toLocaleString("he-IL", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    sendTelegramMessage(chat, `📅 פגישה חדשה נקבעה!\n${args.name} (${args.email})\n${when}`).catch(() => {});
  }
  return { ok: true, meetingAt: start.toISOString() };
}
