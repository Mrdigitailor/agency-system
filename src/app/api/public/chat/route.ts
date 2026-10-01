// הצ'אט הציבורי של דף הנחיתה — פתוח לעולם, עם בלמי שימוש בסיסיים.
// POST בלי sessionToken פותח שיחה חדשה ומחזיר את הודעת הפתיחה.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runChatTurn, OPENING_MESSAGE, OPENING_REPLIES } from "@/lib/prospect/chat-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // תור עם מחקר חי לוקח עד ~25 שניות

const MAX_SESSION_MESSAGES = 80;   // תקרת הודעות לשיחה
const MAX_SESSIONS_PER_IP_HOUR = 10;

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 60) || "unknown";
}

/** שחזור שיחה קיימת — הדפדפן חוזר לדף והשיחה ממשיכה מאיפה שעצרה */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("session") ?? "";
  if (!/^[a-z0-9-]{16,40}$/i.test(token)) return NextResponse.json({ found: false });
  const chat = await prisma.prospectChat.findUnique({ where: { token } });
  if (!chat) return NextResponse.json({ found: false });
  // שיחה ישנה מדי לא משוחזרת — פותחים נקי
  if (Date.now() - chat.updatedAt.getTime() > 72 * 3600_000) return NextResponse.json({ found: false });

  let raw: Array<{ role: string; content: string }> = [];
  try { raw = JSON.parse(chat.messages || "[]"); } catch { /* ריק */ }

  const stripButtons = (t: string) => t.replace(/\[כפתורים:\s*[^\]]+\]\s*$/, "").trim();
  const visible = raw
    .filter((m) => !(m.role === "user" && (m.content.startsWith("[מערכת]") || m.content === "__research__")))
    .map((m) => ({ role: m.role === "assistant" ? "bot" : "user", text: stripButtons(m.content) }))
    .filter((m) => m.text);

  // הכפתורים של ההודעה האחרונה של הסוכן
  let quickReplies: string[] = [];
  const lastBot = [...raw].reverse().find((m) => m.role === "assistant");
  if (lastBot) {
    const match = lastBot.content.match(/\[כפתורים:\s*([^\]]+)\]\s*$/);
    if (match) quickReplies = match[1].split("|").map((x: string) => x.trim()).filter(Boolean).slice(0, 8);
  }

  // שיחה שעוד לא התקדמה: כפתורי הפתיחה חוזרים איתה
  if (quickReplies.length === 0 && visible.length <= 1) quickReplies = [...OPENING_REPLIES];

  return NextResponse.json({ found: true, messages: visible, quickReplies });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }

  const ip = clientIp(req);
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";

  // שיחה חדשה — פתיחה קבועה, בלי קריאה למודל
  if (!sessionToken) {
    const recent = await prisma.prospectChat.count({
      where: { lastIp: ip, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    });
    if (recent >= MAX_SESSIONS_PER_IP_HOUR) {
      return NextResponse.json({ error: "יותר מדי שיחות, נסו שוב מאוחר יותר" }, { status: 429 });
    }
    const chat = await prisma.prospectChat.create({
      data: {
        lastIp: ip,
        messages: JSON.stringify([{ role: "assistant", content: OPENING_MESSAGE, at: new Date().toISOString() }]),
      },
    });
    return NextResponse.json({ sessionToken: chat.token, reply: OPENING_MESSAGE, quickReplies: OPENING_REPLIES, researching: false });
  }

  // המשך שיחה קיימת
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });
  if (!/^[a-z0-9-]{16,40}$/i.test(sessionToken)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const chat = await prisma.prospectChat.findUnique({ where: { token: sessionToken } });
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });

  const count = (() => { try { return (JSON.parse(chat.messages) as unknown[]).length; } catch { return 0; } })();
  if (count >= MAX_SESSION_MESSAGES) {
    return NextResponse.json({ reply: "השיחה התארכה מעבר לצפוי. אשמח שנמשיך בפגישה או במייל: saar@digitailors.co.il", quickReplies: [], researching: false });
  }

  try {
    const result = await runChatTurn(chat.id, message);
    return NextResponse.json({ sessionToken, ...result });
  } catch (err) {
    console.error("[ProspectChat] turn failed, retrying once:", err instanceof Error ? err.message : err);
    try {
      const result = await runChatTurn(chat.id, "[מערכת] ההודעה הקודמת של המשתמש לא טופלה בגלל תקלה. המשך את השיחה ממנה.");
      return NextResponse.json({ sessionToken, ...result });
    } catch (err2) {
      console.error("[ProspectChat] retry failed:", err2 instanceof Error ? err2.message : err2);
      return NextResponse.json({ reply: "סליחה על ההמתנה, הייתה לי תקלה קטנה. אפשר לשלוח שוב את ההודעה האחרונה?", quickReplies: [], researching: false });
    }
  }
}
