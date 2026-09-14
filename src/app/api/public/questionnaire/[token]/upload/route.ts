// העלאת נכסי מותג משאלון הכניסה הציבורי — מאומת ע"י token של השאלון בלבד.
// הדפדפן מעלה ישירות ל-Vercel Blob (עוקף תקרת גוף-בקשה); כאן רק החלפת token,
// עם ולידציה שהקובץ נכתב אך ורק לתיקיית onboarding/<token>/ של השאלון הזה.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const maxDuration = 30;

const ALLOWED_TYPES = [
  // תמונות ולוגואים
  "image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif",
  // מסמכי מיתוג
  "application/pdf",
  // קבצי פונט
  "font/woff", "font/woff2", "font/ttf", "font/otf",
  "application/font-woff", "application/x-font-ttf",
  // וידאו (המלצות, סרטוני תדמית)
  "video/mp4", "video/quicktime", "video/webm",
];

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await params;
  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // אימות: token תקין, שאלון פתוח, לקוח קיים
        if (!token || !/^[a-z0-9-]{16,40}$/i.test(token)) throw new Error("Unauthorized");
        const q = await prisma.clientQuestionnaire.findUnique({
          where: { token },
          include: { client: { select: { deletedAt: true } } },
        });
        if (!q || q.client.deletedAt || q.status === "completed") throw new Error("Unauthorized");
        // הקובץ חייב לשבת בתיקייה של השאלון הזה בלבד
        if (!pathname.startsWith(`onboarding/${token}/`)) throw new Error("Forbidden path");
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB — מספיק גם לסרטון
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
