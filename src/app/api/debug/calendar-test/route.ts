import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: user.id } });

  if (!conn) {
    return NextResponse.json({ status: "NO_CONNECTION", message: "אין חיבור Google Calendar" });
  }

  const debug: Record<string, unknown> = {
    connectionId: conn.id,
    email: conn.email,
    hasAccessToken: !!conn.accessToken,
    tokenLength: conn.accessToken?.length ?? 0,
    hasRefreshToken: !!conn.refreshToken,
    tokenExpiry: conn.tokenExpiry,
    isExpired: conn.tokenExpiry ? conn.tokenExpiry < new Date() : "no expiry set",
  };

  // רענון token אם פג
  let accessToken = conn.accessToken;
  if (conn.tokenExpiry && conn.tokenExpiry < new Date() && conn.refreshToken) {
    debug.refreshing = true;
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
    const refreshData = await res.json();
    debug.refreshResponse = { status: res.status, hasNewToken: !!refreshData.access_token, error: refreshData.error };
    if (refreshData.access_token) {
      accessToken = refreshData.access_token;
      await prisma.googleCalendarConnection.update({
        where: { id: conn.id },
        data: { accessToken, tokenExpiry: refreshData.expires_in ? new Date(Date.now() + refreshData.expires_in * 1000) : null },
      });
    }
  }

  // קריאה ל-API
  const timeMin = "2026-04-01T00:00:00Z";
  const timeMax = "2026-04-30T23:59:59Z";
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10`;

  debug.apiUrl = url;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();

  debug.apiStatus = res.status;
  debug.apiError = data.error ?? null;
  debug.eventCount = data.items?.length ?? 0;
  debug.firstEvents = (data.items ?? []).slice(0, 3).map((e: Record<string, unknown>) => ({
    summary: e.summary,
    start: (e.start as Record<string, string>)?.dateTime ?? (e.start as Record<string, string>)?.date,
  }));

  return NextResponse.json(debug);
}
