import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { getWeeklyClientData } from "@/lib/reports/weekly-data";
import { buildWeeklyDataText } from "@/lib/reports/generate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.REPORT_AI_MODEL ?? "claude-sonnet-4-6";

/**
 * POST /api/clients/[id]/weekly-report/[reportId]/refine
 * Body: { note } — הערת תיקון. ה-AI מחזיר את הדוח המלא המעודכן, מעוגן בנתונים.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId, reportId } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!note) return NextResponse.json({ error: "חסרה הערה" }, { status: 400 });

  const report = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
  if (!report || report.clientId !== clientId) {
    return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });
  }

  // הקשר הנתונים — כדי שהתיקון יישאר מעוגן במספרים האמיתיים
  const [profile, client] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { clientId } }),
    prisma.client.findUnique({ where: { id: clientId }, select: { currency: true } }),
  ]);
  const format = profile?.weeklyReportFormat ?? "standard";
  const products: Array<{ name: string }> = profile ? JSON.parse(profile.products ?? "[]") : [];
  const currency = client?.currency || "ILS";
  const data = await getWeeklyClientData(clientId, report.weekStart, report.weekEnd);
  const dataText = buildWeeklyDataText(data, format, products, currency);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system:
        "אתה עורך דוח שבועי קיים של סוכנות שיווק לפי הערת המשתמש. " +
        "החזר אך ורק את הדוח המלא המעודכן ב-Markdown בעברית (בלי הקדמות כמו 'הנה הדוח'). " +
        "שמור על עיגון מוחלט בנתונים שסופקו — אל תמציא מספרים. " +
        `כל הסכומים במטבע ${currency} בלבד. אל תשתמש בטבלאות Markdown — רשימות תבליטים בפורמט "מדד: ערך".`,
      messages: [
        {
          role: "user",
          content:
            `הדוח הנוכחי:\n\n${report.content}\n\n---\n\nהנתונים בפועל (לעיגון):\n${dataText}\n\n---\n\n` +
            `הערת תיקון: ${note}\n\nהחזר את הדוח המלא המעודכן.`,
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    const revised = block && "text" in block ? block.text.trim() : "";
    if (!revised) return NextResponse.json({ error: "לא התקבל תוכן מעודכן" }, { status: 500 });

    const [updated] = await prisma.$transaction([
      prisma.weeklyReport.update({ where: { id: reportId }, data: { content: revised } }),
      prisma.weeklyReportMessage.create({ data: { reportId, role: "user", content: note } }),
      prisma.weeklyReportMessage.create({ data: { reportId, role: "assistant", content: "✅ עדכנתי את הדוח לפי ההערה." } }),
    ]);

    const messages = await prisma.weeklyReportMessage.findMany({
      where: { reportId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ content: updated.content, messages });
  } catch (err) {
    console.error("[WeeklyReport refine]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
