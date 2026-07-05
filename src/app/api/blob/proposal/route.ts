import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * הגשת הצעת מחיר מאחסון ה-Blob הפרטי — רק למשתמשים מחוברים.
 * ה-store מוגדר private (מסמכים עסקיים רגישים), לכן הדפדפן לא יכול
 * לגשת ל-URL ישירות; ה-route הזה מזרים את הקובץ אחרי בדיקת הרשאה.
 * GET /api/blob/proposal?url=<blobUrl>[&download=1]
 */
export async function GET(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { searchParams } = new URL(req.url);
  const urlParam = searchParams.get("url") ?? "";
  const asDownload = searchParams.get("download") === "1";

  // חילוץ ה-pathname מתוך ה-URL + ולידציה שזה באמת מאחסון שלנו ובתיקיית proposals
  let pathname: string;
  try {
    const u = new URL(urlParam);
    if (!u.hostname.endsWith(".vercel-storage.com")) throw new Error("bad host");
    pathname = decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!pathname.startsWith("proposals/")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fileName = pathname.split("/").pop() ?? "proposal.pdf";
  return new Response(blob.stream, {
    headers: {
      "Content-Type": blob.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
