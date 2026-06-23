import { NextResponse } from "next/server";
import { runWhatsAppAssistant } from "@/lib/whatsapp/assistant";
import { sendWhatsAppMessage, chatIdToPhone, isGreenApiConfigured } from "@/lib/api/green-api/client";

// עיבוד ה-AI עשוי לקחת כמה שניות — מאריכים את חלון ההרצה
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** רשימת המספרים המורשים לתקשר עם הבוט (ספרות, פורמט בינלאומי) */
function allowedNumbers(): Set<string> {
  const raw = process.env.WHATSAPP_ALLOWED_NUMBERS ?? "";
  const norm = (p: string) => {
    let d = p.replace(/\D/g, "");
    if (d.startsWith("0")) d = "972" + d.slice(1);
    return d;
  };
  return new Set(
    raw
      .split(",")
      .map((s) => norm(s))
      .filter(Boolean),
  );
}

/**
 * POST /api/whatsapp/webhook?token=...
 * מקבל הודעות נכנסות מ-Green API.
 */
export async function POST(req: Request) {
  // אבטחה אופציונלית — token בכתובת ה-webhook שמוגדרת ב-Green API
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (secret) {
    const token = new URL(req.url).searchParams.get("token");
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // לא JSON — מתעלמים בשקט
  }

  // מעבדים רק הודעות טקסט נכנסות
  if (body.typeWebhook !== "incomingMessageReceived") {
    return NextResponse.json({ ok: true });
  }

  const senderData = body.senderData as { chatId?: string; sender?: string } | undefined;
  const messageData = body.messageData as
    | {
        typeMessage?: string;
        textMessageData?: { textMessage?: string };
        extendedTextMessageData?: { text?: string };
      }
    | undefined;

  const chatId = senderData?.chatId ?? "";
  const senderDigits = chatIdToPhone(senderData?.sender ?? senderData?.chatId ?? "");
  const text =
    messageData?.textMessageData?.textMessage ?? messageData?.extendedTextMessageData?.text ?? "";

  if (!chatId || !text.trim()) {
    return NextResponse.json({ ok: true });
  }

  // בדיקת הרשאה — רק מספרים מורשים מקבלים מענה
  const allowed = allowedNumbers();
  if (allowed.size > 0 && !allowed.has(senderDigits)) {
    console.warn(`[WhatsApp] Ignoring message from unauthorized number: ${senderDigits}`);
    return NextResponse.json({ ok: true });
  }

  if (!isGreenApiConfigured()) {
    console.error("[WhatsApp] Green API not configured — cannot reply");
    return NextResponse.json({ ok: true });
  }

  try {
    const reply = await runWhatsAppAssistant(text.trim(), senderDigits);
    await sendWhatsAppMessage(chatId, reply);
  } catch (err) {
    console.error("[WhatsApp] Assistant error:", err);
    await sendWhatsAppMessage(chatId, "אירעה שגיאה בעיבוד הבקשה. נסה שוב מאוחר יותר.");
  }

  return NextResponse.json({ ok: true });
}

// Green API לא דורש אימות GET, אך נחזיר 200 לבדיקות בריאות
export async function GET() {
  return NextResponse.json({ ok: true, service: "whatsapp-webhook" });
}
