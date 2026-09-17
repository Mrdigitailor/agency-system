import { get } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { hasUploadSecret, isMediaFile, mediaPath } from "@/lib/media-report";

export const dynamic = "force-dynamic";

/**
 * ממשק לצינור הנתונים החיצוני של דוח המדיה. מאומת בסוד MEDIA_REPORT_SECRET בלבד.
 *
 * GET  ?clientId=&file=report|state  → הורדת הקובץ השמור (הצינור מושך את המצב בתחילת ריצה)
 * POST { clientId, file }            → אסימון העלאה חד-פעמי לנתיב המדויק בלבד.
 *                                      ההעלאה עצמה עוברת ישר ל-Blob, בלי מגבלת 4.5MB של הפונקציה.
 */
export async function GET(req: Request) {
  if (!hasUploadSecret(req)) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const file = searchParams.get("file");
  const pathname = isMediaFile(file) ? mediaPath(searchParams.get("clientId") ?? "", file) : null;
  if (!pathname) return NextResponse.json({ error: "פרמטרים לא תקינים" }, { status: 400 });

  const blob = await get(pathname, { access: "private" }).catch(() => null);
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }
  return new Response(blob.stream, {
    headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  if (!hasUploadSecret(req)) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pathname = isMediaFile(body?.file) ? mediaPath(String(body?.clientId ?? ""), body.file) : null;
  if (!pathname) return NextResponse.json({ error: "פרמטרים לא תקינים" }, { status: 400 });

  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname,
    allowOverwrite: true,
    addRandomSuffix: false,
    maximumSizeInBytes: 200 * 1024 * 1024,
    validUntil: Date.now() + 30 * 60 * 1000,
  });
  return NextResponse.json({ token, pathname });
}
