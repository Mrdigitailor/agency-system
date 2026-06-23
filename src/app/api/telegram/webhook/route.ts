import { NextResponse } from "next/server";
import { runCampaignAssistant } from "@/lib/assistant/campaign-assistant";
import { sendTelegramMessage, isTelegramConfigured } from "@/lib/api/telegram/client";

// עיבוד ה-AI עשוי לקחת כמה שניות
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** מזהי משתמשי טלגרם מורשים (מספריים) */
function allowedUserIds(): Set<string> {
  const raw = process.env.TELEGRAM_ALLOWED_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    from?: { id?: number; first_name?: string; username?: string };
    text?: string;
  };
}

/**
 * POST /api/telegram/webhook
 * מקבל updates מטלגרם.
 */
export async function POST(req: Request) {
  // אבטחה — טלגרם שולח את הסוד בכותרת זו בכל בקשה
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ ok: true }); // מתעלמים בשקט מבקשות לא מאומתות
    }
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  const text = (message?.text ?? "").trim();

  if (!chatId || !userId || !text) {
    return NextResponse.json({ ok: true });
  }

  if (!isTelegramConfigured()) {
    console.error("[Telegram] Bot token not configured — cannot reply");
    return NextResponse.json({ ok: true });
  }

  const allowed = allowedUserIds();

  // bootstrap: אם אין הרשאה — מחזירים למשתמש את ה-ID שלו כדי שאפשר יהיה להוסיף אותו
  if (allowed.size === 0 || !allowed.has(String(userId))) {
    await sendTelegramMessage(
      chatId,
      `🔒 הגישה לבוט מוגבלת.\nה-Telegram ID שלך: ${userId}\nבקש מהאדמין להוסיף אותו ל-TELEGRAM_ALLOWED_USER_IDS.`,
    );
    return NextResponse.json({ ok: true });
  }

  // פקודת פתיחה
  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      "שלום! 👋 אני העוזר של DigiTailors.\n\n" +
        "אפשר:\n" +
        "• לפתוח משימה — למשל: “פתח משימה ללקוח X: לבדוק חריגת תקציב, עדיפות גבוהה”\n" +
        "• לשאול על ביצועים — למשל: “מה הביצועים של X בשבוע האחרון?”",
    );
    return NextResponse.json({ ok: true });
  }

  try {
    const reply = await runCampaignAssistant(text);
    await sendTelegramMessage(chatId, reply);
  } catch (err) {
    console.error("[Telegram] Assistant error:", err);
    await sendTelegramMessage(chatId, "אירעה שגיאה בעיבוד הבקשה. נסה שוב מאוחר יותר.");
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}
