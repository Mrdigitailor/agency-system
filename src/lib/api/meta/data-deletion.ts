import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * טיפול בבקשות מחיקת נתונים מ-Meta (Data Deletion Callback).
 * פייסבוק שולח signed_request חתום ב-App Secret; מאמתים, מחלצים את מזהה המשתמש,
 * ומוחקים כל רשומת cache שמכילה אותו (שיחות/תגובות בפייסבוק ואינסטגרם).
 */

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** מאמת את החתימה ומחזיר את ה-payload, או null אם החתימה לא תקינה */
export function parseSignedRequest(signedRequest: string, appSecret: string): { user_id?: string } | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, payload] = parts;

  const expected = crypto.createHmac("sha256", appSecret).update(payload).digest();
  let provided: Buffer;
  try {
    provided = base64UrlDecode(encodedSig);
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;

  try {
    return JSON.parse(base64UrlDecode(payload).toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * מוחק כל רשומת cache שמכילה את מזהה המשתמש (בכל השדות האפשריים: PSID/IGSID/fromId).
 * מחזיר כמה רשומות נמחקו.
 */
export async function deleteUserData(metaUserId: string): Promise<number> {
  const [fbConv, fbComm, igConv, igComm] = await Promise.all([
    prisma.fbConversationCache.deleteMany({ where: { participantPsid: metaUserId } }),
    prisma.fbCommentCache.deleteMany({ where: { fromId: metaUserId } }),
    prisma.igConversationCache.deleteMany({ where: { participantId: metaUserId } }),
    prisma.igCommentCache.deleteMany({ where: { fromId: metaUserId } }),
  ]);
  return fbConv.count + fbComm.count + igConv.count + igComm.count;
}
