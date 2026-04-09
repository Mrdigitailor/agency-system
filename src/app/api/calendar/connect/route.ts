import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";

export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/calendar/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state: result.id,
  });

  return NextResponse.json({
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
}
