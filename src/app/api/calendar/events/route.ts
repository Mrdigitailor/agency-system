import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

async function refreshTokenIfNeeded(conn: { id: string; accessToken: string; refreshToken: string; tokenExpiry: Date | null }) {
  if (!conn.tokenExpiry || conn.tokenExpiry > new Date()) return conn.accessToken;
  if (!conn.refreshToken) return conn.accessToken;

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
      data: {
        accessToken: data.access_token,
        tokenExpiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
      },
    });
    return data.access_token;
  }
  return conn.accessToken;
}

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

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  if (timeMin) params.append("timeMin", timeMin);
  if (timeMax) params.append("timeMax", timeMax);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[GCal Events]", err);
    return NextResponse.json({ connected: true, events: [], error: "שגיאה בשליפת אירועים" });
  }

  const data = await res.json();
  const events = (data.items ?? []).map((e: Record<string, unknown>) => ({
    id: e.id,
    title: e.summary ?? "(ללא כותרת)",
    start: (e.start as Record<string, string>)?.dateTime ?? (e.start as Record<string, string>)?.date,
    end: (e.end as Record<string, string>)?.dateTime ?? (e.end as Record<string, string>)?.date,
    allDay: !!(e.start as Record<string, string>)?.date,
    location: e.location ?? "",
    description: e.description ?? "",
  }));

  return NextResponse.json({ connected: true, events, email: conn.email });
}
