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
    console.error("[ProspectChat] turn failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ reply: "משהו השתבש אצלי לרגע. נסו שוב?", quickReplies: [], researching: false });
  }
}
