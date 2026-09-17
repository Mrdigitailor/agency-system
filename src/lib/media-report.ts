import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * דוח מדיה חיצוני ללקוח — דף HTML עצמאי שנבנה מחוץ למערכת (צינור נתונים יומי
 * ב-GitHub Actions) ונשמר ב-Blob הפרטי. המערכת רק מאחסנת ומגישה אותו.
 *
 * שני קבצים לכל לקוח, בנתיב קבוע:
 *   media-reports/<clientId>/dashboard.html — הדוח עצמו
 *   media-reports/<clientId>/state.tgz      — מצב הצינור בין ריצות (מכיל מידע אישי,
 *                                             ולכן נשמר כאן ולא בריפו)
 */
export const MEDIA_FILES = { report: "dashboard.html", state: "state.tgz" } as const;
export type MediaFile = keyof typeof MEDIA_FILES;

const CLIENT_ID_RE = /^[a-z0-9]{20,40}$/;

export function isMediaFile(v: unknown): v is MediaFile {
  return typeof v === "string" && v in MEDIA_FILES;
}

export function mediaPath(clientId: string, file: MediaFile): string | null {
  if (!CLIENT_ID_RE.test(clientId)) return null;
  return `media-reports/${clientId}/${MEDIA_FILES[file]}`;
}

/** אימות הצינור החיצוני. סוד ייעודי ולא CRON_SECRET — כדי שדליפה שלו לא תפתח את שאר ה-cron. */
export function hasUploadSecret(req: Request): boolean {
  const expected = process.env.MEDIA_REPORT_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** האם המשתמש רשאי לצפות בדוח של הלקוח. */
export async function canViewClient(user: { id: string; role: string }, clientId: string): Promise<boolean> {
  if (user.role === "admin" || user.role === "manager") return true;
  if (user.role !== "campaignManager" && user.role !== "client") return false;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { assignedClientIds: true, isActive: true },
  });
  if (!dbUser?.isActive) return false;
  try {
    const ids = JSON.parse(dbUser.assignedClientIds || "[]");
    return Array.isArray(ids) && ids.includes(clientId);
  } catch {
    return false;
  }
}
