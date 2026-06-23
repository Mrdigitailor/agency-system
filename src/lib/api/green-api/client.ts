// Green API — WhatsApp client
// תיעוד: https://green-api.com/en/docs/api/

const INSTANCE = process.env.GREEN_API_INSTANCE_ID ?? "";
const TOKEN = process.env.GREEN_API_TOKEN ?? "";
// כל אינסטנס ב-Green API מקבל host ייעודי (לדוגמה https://7105.api.greenapi.com).
// אם לא הוגדר — נשתמש ב-host הכללי הישן.
const HOST = process.env.GREEN_API_URL ?? "https://api.green-api.com";

export function isGreenApiConfigured(): boolean {
  return Boolean(INSTANCE && TOKEN);
}

/**
 * המרת מספר טלפון ל-chatId של Green API (פורמט: <מספר בינלאומי>@c.us).
 * מטפל במספר ישראלי מקומי (05X → 9725X).
 */
export function phoneToChatId(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "972" + digits.slice(1);
  return `${digits}@c.us`;
}

/** חילוץ מספר טלפון נקי (ספרות בלבד) מ-chatId או sender של Green API */
export function chatIdToPhone(chatId: string): string {
  return chatId.replace(/@.*$/, "").replace(/\D/g, "");
}

/**
 * שליחת הודעת WhatsApp דרך Green API.
 * chatId יכול להיות "<phone>@c.us" (איש) או "<id>@g.us" (קבוצה).
 */
export async function sendWhatsAppMessage(chatId: string, message: string): Promise<boolean> {
  if (!isGreenApiConfigured()) {
    console.warn("[GreenAPI] Not configured — skipping sendMessage");
    return false;
  }

  const url = `${HOST}/waInstance${INSTANCE}/sendMessage/${TOKEN}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[GreenAPI] sendMessage failed (${res.status}):`, err.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[GreenAPI] sendMessage error:", err);
    return false;
  }
}
