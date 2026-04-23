import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { APP_ID } from "@/lib/api/tiktok/client";

export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "חסר clientId" }, { status: 400 });

  const isProd = process.env.NODE_ENV === "production";
  const redirectUri = isProd
    ? "https://agency.mr-digitailor.co.il/api/platforms/tiktok/callback"
    : `${url.origin}/api/platforms/tiktok/callback`;

  const state = Buffer.from(JSON.stringify({ clientId, userId: result.id })).toString("base64url");

  const authUrl = `https://business-api.tiktok.com/portal/auth?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return NextResponse.json({ authUrl });
}
