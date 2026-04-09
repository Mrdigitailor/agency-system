import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

async function refreshTokenIfNeeded(conn: { id: string; accessToken: string; refreshToken: string; tokenExpiry: Date | null }) {
  if (!conn.tokenExpiry || conn.tokenExpiry > new Date()) return conn.accessToken;
  if (!conn.refreshToken) {
    console.log("[GCal] Token expired but no refresh token");
    return conn.accessToken;
  }
  console.log("[GCal] Token expired, refreshing...");
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
  if (data.access_token) {
    await prisma.googleCalendarConnection.update({
      where: { id: conn.id },
      data: { accessToken: data.access_token, tokenExpiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null },
    });
    return data.access_token;
  }
  console.error("[GCal] Refresh failed:", data);
  return conn.accessToken;
}

// GET — שליפת אירועים
export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const { searchParams } = new URL(req.url);
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");

  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: user.id } });
  if (!conn) return NextResponse.json({ connected: false, events: [] });

  const accessToken = await refreshTokenIfNeeded(conn);
  const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "200" });
  if (timeMin) params.append("timeMin", timeMin);
  if (timeMax) params.append("timeMax", timeMax);

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;
  console.log("[GCal] GET", url.slice(0, 120));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  console.log("[GCal] Status:", res.status, "| Events:", data.items?.length ?? 0);
  if (!res.ok) { console.error("[GCal] Error:", JSON.stringify(data.error ?? data)); return NextResponse.json({ connected: true, events: [], error: data.error?.message ?? "שגיאה" }); }

  const events = (data.items ?? []).map((e: Record<string, unknown>) => ({
    id: e.id, title: e.summary ?? "(ללא כותרת)",
    start: (e.start as Record<string, string>)?.dateTime ?? (e.start as Record<string, string>)?.date,
    end: (e.end as Record<string, string>)?.dateTime ?? (e.end as Record<string, string>)?.date,
    allDay: !!(e.start as Record<string, string>)?.date,
    location: e.location ?? "", description: e.description ?? "", colorId: e.colorId ?? "",
  }));
  return NextResponse.json({ connected: true, events, email: conn.email });
}

// POST — יצירת אירוע
export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: user.id } });
  if (!conn) return NextResponse.json({ error: "לא מחובר" }, { status: 400 });
  const accessToken = await refreshTokenIfNeeded(conn);
  const body = await req.json();

  const eventBody: Record<string, unknown> = {
    summary: body.title, description: body.description ?? "",
    start: body.allDay ? { date: body.startDate } : { dateTime: body.startDateTime, timeZone: "Asia/Jerusalem" },
    end: body.allDay ? { date: body.endDate } : { dateTime: body.endDateTime, timeZone: "Asia/Jerusalem" },
  };
  if (body.colorId) eventBody.colorId = body.colorId;
  if (body.reminder) eventBody.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: body.reminder }] };

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: data.error?.message ?? "שגיאה" }, { status: 500 });
  return NextResponse.json({ id: data.id, title: data.summary }, { status: 201 });
}

// PATCH — עריכת אירוע
export async function PATCH(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: user.id } });
  if (!conn) return NextResponse.json({ error: "לא מחובר" }, { status: 400 });
  const accessToken = await refreshTokenIfNeeded(conn);
  const body = await req.json();
  const { eventId, ...updates } = body;
  const eventBody: Record<string, unknown> = {};
  if (updates.title) eventBody.summary = updates.title;
  if (updates.description !== undefined) eventBody.description = updates.description;
  if (updates.startDateTime) eventBody.start = { dateTime: updates.startDateTime, timeZone: "Asia/Jerusalem" };
  if (updates.endDateTime) eventBody.end = { dateTime: updates.endDateTime, timeZone: "Asia/Jerusalem" };

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody),
  });
  if (!res.ok) { const data = await res.json(); return NextResponse.json({ error: data.error?.message ?? "שגיאה" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

// DELETE — מחיקת אירוע
export async function DELETE(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: user.id } });
  if (!conn) return NextResponse.json({ error: "לא מחובר" }, { status: 400 });
  const accessToken = await refreshTokenIfNeeded(conn);
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "חסר eventId" }, { status: 400 });

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
