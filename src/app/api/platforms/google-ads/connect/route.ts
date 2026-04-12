import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/platforms/google-ads/connect?clientId=xxx
 * מייצר Google OAuth URL עם scope adwords
 */
export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "חסר clientId" }, { status: 400 });
  }

  const origin = url.origin;
  const isProd = process.env.NODE_ENV === "production";
  const redirectUri = isProd
    ? "https://agency.mr-digitailor.co.il/api/platforms/google-ads/callback"
    : `${origin}/api/platforms/google-ads/callback`;

  // state מכיל clientId + userId
  const state = Buffer.from(JSON.stringify({ clientId, userId: result.id })).toString("base64url");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log("[GoogleAds OAuth] authUrl:", authUrl.slice(0, 200));

  return NextResponse.json({ authUrl });
}
