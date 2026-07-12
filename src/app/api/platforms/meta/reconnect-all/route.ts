import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { buildAuthUrl } from "@/lib/api/meta/oauth";

/**
 * התחלת OAuth יחיד שמעדכן את ה-token לכל הלקוחות בבת אחת.
 * GET /api/platforms/meta/reconnect-all → { authUrl }
 * ה-callback מזהה mode=all ומעדכן את כל חיבורי ה-Meta הקיימים, בלי לגעת בבחירת הנכסים.
 */
export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.role !== "admin") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const origin = new URL(req.url).origin;
  const authUrl = buildAuthUrl("", result.id, origin, "all");
  return NextResponse.json({ authUrl });
}
