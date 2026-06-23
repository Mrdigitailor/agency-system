// תמלול אודיו (speech-to-text) — תואם OpenAI Whisper API.
// עובד גם מול Groq (whisper-large-v3) וגם מול OpenAI (whisper-1) — אותו endpoint.

const API_URL = process.env.TRANSCRIPTION_API_URL ?? "https://api.groq.com/openai/v1";
const API_KEY = process.env.TRANSCRIPTION_API_KEY ?? "";
const MODEL = process.env.TRANSCRIPTION_MODEL ?? "whisper-large-v3";

export function isTranscriptionConfigured(): boolean {
  return Boolean(API_KEY);
}

/**
 * מתמלל אודיו (OGG/Opus מטלגרם) לטקסט בעברית.
 * מחזיר את הטקסט או null אם נכשל / לא מוגדר.
 */
export async function transcribeAudio(audio: ArrayBuffer, filename = "voice.oga"): Promise<string | null> {
  if (!isTranscriptionConfigured()) {
    console.warn("[Transcription] Not configured — skipping");
    return null;
  }
  try {
    const form = new FormData();
    form.append("file", new Blob([audio]), filename);
    form.append("model", MODEL);
    form.append("language", "he");
    form.append("response_format", "json");

    const res = await fetch(`${API_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[Transcription] failed (${res.status}):`, err.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return (data.text ?? "").trim() || null;
  } catch (err) {
    console.error("[Transcription] error:", err);
    return null;
  }
}
