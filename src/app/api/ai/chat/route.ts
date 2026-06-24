import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { buildSystemPrompt } from "@/lib/api/ai/buildSystemPrompt";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/ai/chat
 * body: { chatId, clientId, message }
 * Returns: streaming text/event-stream
 */
export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;

  const body = await req.json();
  const { chatId, clientId, message } = body;

  if (!clientId || !message) {
    return NextResponse.json({ error: "clientId and message required" }, { status: 400 });
  }

  // Rate limiting — 50 שאלות ביום
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.aiChatMessage.count({
    where: { userId: user.id, role: "user", createdAt: { gte: todayStart } },
  });
  if (todayCount >= 50) {
    return NextResponse.json({ error: "הגעת למגבלת 50 שאלות ביום" }, { status: 429 });
  }

  // יצירת/שליפת שיחה
  let actualChatId = chatId;
  if (!actualChatId) {
    const chat = await prisma.aiChat.create({
      data: { clientId, userId: user.id, title: message.slice(0, 50) },
    });
    actualChatId = chat.id;
  }

  // שמירת ההודעה של המשתמש
  await prisma.aiChatMessage.create({
    data: { chatId: actualChatId, userId: user.id, role: "user", content: message },
  });

  // בניית היסטוריה + system prompt
  const systemPrompt = await buildSystemPrompt(clientId);
  const history = await prisma.aiChatMessage.findMany({
    where: { chatId: actualChatId, role: { not: "system" } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const messages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Streaming response
  const stream = await anthropic.messages.create({
    model: process.env.AI_CHAT_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 4000,
    system: systemPrompt,
    messages,
    stream: true,
  });

  // יצירת ReadableStream
  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text, chatId: actualChatId })}\n\n`));
          }
        }

        // שמירת התשובה המלאה ב-DB
        await prisma.aiChatMessage.create({
          data: { chatId: actualChatId, role: "assistant", content: fullResponse },
        });

        // עדכון כותרת השיחה אם זו ההודעה הראשונה
        if (history.length <= 2) {
          await prisma.aiChat.update({
            where: { id: actualChatId },
            data: { title: message.slice(0, 60), updatedAt: new Date() },
          });
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, chatId: actualChatId })}\n\n`));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
