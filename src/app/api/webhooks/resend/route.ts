// Webhook של Resend — מקבל אירועי מיילים (נמסר/נפתח/הוקלק/נדחה) ומעדכן את תיעוד המשפך.
// אימות: חתימת svix עם RESEND_WEBHOOK_SECRET (מוגדר בלוח של Resend תחת Webhooks).
// הנתיב ציבורי בכוונה (webhook חיצוני), ולכן כל בקשה חייבת לעבור אימות חתימה.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** אימות חתימת svix: HMAC-SHA256 על "id.timestamp.body" עם הסוד המפוענח מ-base64 */
function verifySignature(body: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!secret) return false;
  const id = headers.get("svix-id") ?? "";
  const timestamp = headers.get("svix-timestamp") ?? "";
  const signatures = headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signatures) return false;

  // הגנה מפני שידור חוזר: חותמת זמן בת יותר מ-5 דקות נדחית
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return signatures.split(" ").some((part) => {
    const sig = part.split(",")[1] ?? "";
    try {
      return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch { return false; }
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  if (!verifySignature(body, req.headers)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try { event = JSON.parse(body); } catch { return NextResponse.json({ error: "bad payload" }, { status: 400 }); }

  const resendId = event.data?.email_id ?? "";
  if (!resendId) return NextResponse.json({ ok: true, skipped: "no email_id" });

  const now = new Date();
  // כל אירוע נרשם פעם אחת — הזמן הראשון הוא המעניין
  const updates: Record<string, { where: object; data: object }> = {
    "email.delivered": { where: { resendId, deliveredAt: null }, data: { deliveredAt: now } },
    "email.opened":    { where: { resendId, openedAt: null },    data: { openedAt: now } },
    "email.clicked":   { where: { resendId, clickedAt: null },   data: { clickedAt: now } },
    "email.bounced":   { where: { resendId, bouncedAt: null },   data: { bouncedAt: now } },
  };
  const update = updates[event.type ?? ""];
  if (update) {
    await prisma.prospectEmailLog.updateMany({ where: update.where as never, data: update.data as never }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
