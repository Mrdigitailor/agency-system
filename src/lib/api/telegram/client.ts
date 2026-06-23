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
 * מוריד קובץ מטלגרם לפי file_id (לדוגמה הודעה קולית) ומחזיר את התוכן כ-ArrayBuffer.
 */
export async function downloadTelegramFile(fileId: string): Promise<ArrayBuffer | null> {
  if (!isTelegramConfigured()) return null;
  try {
    const infoRes = await fetch(`${API}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const info = await infoRes.json();
    const filePath = info?.result?.file_path;
    if (!info.ok || !filePath) {
      console.error("[Telegram] getFile failed:", JSON.stringify(info).slice(0, 200));
      return null;
    }
    const fileRes = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${filePath}`);
    if (!fileRes.ok) {
      console.error(`[Telegram] file download failed (${fileRes.status})`);
      return null;
    }
    return await fileRes.arrayBuffer();
  } catch (err) {
    console.error("[Telegram] downloadTelegramFile error:", err);
    return null;
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
