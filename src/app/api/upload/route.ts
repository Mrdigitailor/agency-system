import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * העלאת קבצים (הצעות מחיר וכו') ישירות מהדפדפן ל-Vercel Blob.
 * הדפדפן מעלה ישירות ל-Blob — הבקשה לכאן היא רק החלפת token קטנה,
 * כך שאין תקרת גוף-בקשה של 4.5MB (שגרמה ל-"Request Entity Too Large").
 */
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // רק משתמש מחובר יכול להעלות
        const auth = await requireAuth();
        if (auth instanceof NextResponse) throw new Error("Unauthorized");
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
          ],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB
        };
      },
      // שמירת ה-URL ללקוח נעשית בצד-הלקוח (PATCH ל-/api/leads), אין צורך בקולבק
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
