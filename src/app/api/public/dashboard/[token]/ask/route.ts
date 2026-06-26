import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { answerDashboardQuestion } from "@/lib/dashboard/ai";
import { sanitizeRange } from "@/lib/dashboard/dto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// rate limit פשוט בזיכרון — עד 12 שאלות ל-5 דקות per token
const RATE = new Map<string, number[]>();
function allowed(token: string): boolean {
  const now = Date.now();
  const arr = (RATE.get(token) ?? []).filter((t) => now - t < 300_000);
  arr.push(now);
  RATE.set(token, arr);
  return arr.length <= 12;
}

/**
 * POST /api/public/dashboard/[token]/ask  { question, since?, until? }
 * שאלת AI שיחתית על הנתונים (ציבורי, מאומת token, rate-limited).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const client = await prisma.client.findFirst({
    where: { publicDashboardToken: token, publicDashboardEnabled: true, deletedAt: null },
    select: { id: true, name: true, currency: true, clientType: true, metaConversionEvent: true, googleConversionAction: true },
  });
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!allowed(token)) return NextResponse.json({ error: "יותר מדי שאלות. נסה שוב בעוד מספר דקות." }, { status: 429 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const question = (typeof body.question === "string" ? body.question : "").trim().slice(0, 500);
  if (!question) return NextResponse.json({ error: "חסרה שאלה" }, { status: 400 });

  const range = sanitizeRange(typeof body.since === "string" ? body.since : null, typeof body.until === "string" ? body.until : null);
  const ctx = {
    clientId: client.id,
    currency: client.currency || "ILS",
    clientType: client.clientType || "לידים",
    metaConversionEvent: client.metaConversionEvent || "",
    googleConversionAction: client.googleConversionAction || "",
  };

  try {
    const answer = await answerDashboardQuestion(ctx, range, client.name, question);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[Dashboard ask]", err);
    return NextResponse.json({ error: "שגיאה בניתוח. נסה שוב." }, { status: 500 });
  }
}
