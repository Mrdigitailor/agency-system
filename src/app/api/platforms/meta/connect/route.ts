import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { buildAuthUrl } from "@/lib/api/meta/oauth";

/**
 * התחלת OAuth flow עם Meta
 * GET /api/platforms/meta/connect?clientId=xxx
 * מחזיר URL שצריך לפתוח אותו בדפדפן
 */
export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "חסר clientId" }, { status: 400 });
  }

  const authUrl = buildAuthUrl(clientId, result.id);
  return NextResponse.json({ authUrl });
}
