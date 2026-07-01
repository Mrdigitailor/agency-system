import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runCampaignAssistant } from "@/lib/assistant/campaign-assistant";
import { sendTelegramMessage, sendTelegramWithButtons, answerCallbackQuery, editMessageReplyMarkup, isTelegramConfigured, downloadTelegramFile } from "@/lib/api/telegram/client";
import { transcribeAudio, isTranscriptionConfigured } from "@/lib/api/transcription/client";
import { createTaskFromDraft, refineDraft, draftKeyboard, approvedKeyboard } from "@/lib/performance/approval";

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
    voice?: { file_id?: string };
    audio?: { file_id?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number }; message_id?: number };
  };
}

/** טיפול בהקלקת כפתור (אישור/הערות) על אבחון */
async function handleCallback(cb: NonNullable<TelegramUpdate["callback_query"]>, allowed: Set<string>): Promise<void> {
  const userId = cb.from?.id;
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  if (!userId || !allowed.has(String(userId))) { await answerCallbackQuery(cb.id, "אין הרשאה"); return; }

  const [kind, id] = (cb.data ?? "").split(":");
  if (kind === "ok" && id) {
    const created = await createTaskFromDraft(id).catch(() => false);
    await answerCallbackQuery(cb.id, created ? "✅ נוצרה משימה" : "כבר טופל");
    if (created && chatId && messageId) await editMessageReplyMarkup(chatId, messageId, approvedKeyboard());
  } else if (kind === "note" && id) {
    // מסמנים שהטיוטה הזו ממתינה להערה, ומנקים ממתינות אחרות באותו צ'אט
    await prisma.actionDraft.updateMany({ where: { chatId: String(chatId), awaitingNotes: true }, data: { awaitingNotes: false } });
    await prisma.actionDraft.update({ where: { id }, data: { awaitingNotes: true, chatId: String(chatId) } }).catch(() => {});
    await answerCallbackQuery(cb.id);
    if (chatId) await sendTelegramMessage(chatId, "💬 כתוב את ההערה שלך על הפעולה — אבין, אנסח מחדש, ואחזור אליך לאישור:");
  } else {
    await answerCallbackQuery(cb.id);
  }
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

  if (!isTelegramConfigured()) {
    console.error("[Telegram] Bot token not configured — cannot reply");
    return NextResponse.json({ ok: true });
  }
  const allowed = allowedUserIds();

  // הקלקת כפתור על אבחון (אישור כמשימה / הערות)
  if (update.callback_query) {
    await handleCallback(update.callback_query, allowed);
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  let text = (message?.text ?? "").trim();
  const voiceFileId = message?.voice?.file_id ?? message?.audio?.file_id;

  if (!chatId || !userId || (!text && !voiceFileId)) {
    return NextResponse.json({ ok: true });
  }

  // bootstrap: אם אין הרשאה — מחזירים למשתמש את ה-ID שלו כדי שאפשר יהיה להוסיף אותו
  if (allowed.size === 0 || !allowed.has(String(userId))) {
    await sendTelegramMessage(
      chatId,
      `🔒 הגישה לבוט מוגבלת.\nה-Telegram ID שלך: ${userId}\nבקש מהאדמין להוסיף אותו ל-TELEGRAM_ALLOWED_USER_IDS.`,
    );
    return NextResponse.json({ ok: true });
  }

  // הודעה קולית — מורידים, מתמללים, ומאשרים מה הובן
  if (!text && voiceFileId) {
    if (!isTranscriptionConfigured()) {
      await sendTelegramMessage(chatId, "תמלול הודעות קוליות עדיין לא מוגדר במערכת. שלח טקסט בינתיים.");
      return NextResponse.json({ ok: true });
    }
    const audio = await downloadTelegramFile(voiceFileId);
    const transcript = audio ? await transcribeAudio(audio) : null;
    if (!transcript) {
      await sendTelegramMessage(chatId, "לא הצלחתי לתמלל את ההודעה הקולית 🎙️ נסה שוב או שלח טקסט.");
      return NextResponse.json({ ok: true });
    }
    text = transcript;
    await sendTelegramMessage(chatId, `🎙️ הבנתי: "${text}"`);
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

  // אם המשתמש במצב "הערות" על אבחון — הטקסט הוא הערה: מחדדים ומחזירים לאישור
  const pending = await prisma.actionDraft.findFirst({
    where: { chatId: String(chatId), awaitingNotes: true },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    await prisma.actionDraft.update({ where: { id: pending.id }, data: { awaitingNotes: false } });
    const revised = await refineDraft(pending.id, text);
    if (revised) {
      await sendTelegramWithButtons(chatId, `✏️ ניסוח מעודכן לפי ההערה שלך:\n\n${revised}`, draftKeyboard(pending.id));
    } else {
      await sendTelegramMessage(chatId, "לא הצלחתי לנסח מחדש. נסה שוב או נסח את ההערה אחרת.");
    }
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
