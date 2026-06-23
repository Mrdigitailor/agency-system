// Telegram Bot API client
// תיעוד: https://core.telegram.org/bots/api

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API = `https://api.telegram.org/bot${TOKEN}`;

export function isTelegramConfigured(): boolean {
  return Boolean(TOKEN);
}

/** שליחת הודעת טקסט לצ'אט בטלגרם */
export async function sendTelegramMessage(chatId: number | string, text: string): Promise<boolean> {
  if (!isTelegramConfigured()) {
    console.warn("[Telegram] Not configured — skipping sendMessage");
    return false;
  }
  try {
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[Telegram] sendMessage failed (${res.status}):`, err.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Telegram] sendMessage error:", err);
    return false;
  }
}

/**
 * רישום ה-webhook מול טלגרם. נקרא פעם אחת מהגדרה.
 * secret נשלח חזרה ע"י טלגרם בכותרת X-Telegram-Bot-Api-Secret-Token בכל בקשה.
 */
export async function setTelegramWebhook(url: string, secret?: string): Promise<{ ok: boolean; description?: string }> {
  if (!isTelegramConfigured()) return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" };
  const res = await fetch(`${API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret || undefined,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  return res.json();
}
