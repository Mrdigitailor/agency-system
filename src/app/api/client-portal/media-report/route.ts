import { get, head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { requirePortalClient } from "@/lib/auth/portal";
import { canViewClient, mediaPath } from "@/lib/media-report";

export const dynamic = "force-dynamic";

/**
 * הגשת דוח המדיה למשתמש מחובר בלבד.
 *   לקוח קצה  → הדוח של הלקוח המשויך אליו
 *   צוות       → ?clientId=... , בכפוף לשיוך (אדמין ומנהל — כל לקוח)
 *   ?check=1   → { available } בלבד, לתפריט הפורטל
 *
 * הדוח מכיל שמות מטופלות — אין לו קישור ציבורי ואין מטמון משותף.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);

  let clientId: string;
  if (auth.role === "client") {
    const portal = await requirePortalClient();
    if (portal instanceof NextResponse) return portal;
    clientId = portal.clientId;
  } else {
    clientId = searchParams.get("clientId") ?? "";
  }
  if (!(await canViewClient(auth, clientId))) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  const pathname = mediaPath(clientId, "report");
  if (!pathname) return NextResponse.json({ error: "לקוח לא תקין" }, { status: 400 });

  if (searchParams.get("check") === "1") {
    const exists = await head(pathname).then(() => true).catch(() => false);
    return NextResponse.json({ available: exists }, { headers: { "Cache-Control": "no-store" } });
  }

  const blob = await get(pathname, { access: "private" }).catch(() => null);
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px;color:#555">דוח המדיה עדיין לא זמין.</body>',
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  return new Response(blob.stream, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "X-Robots-Tag": "noindex",
    },
  });
}
