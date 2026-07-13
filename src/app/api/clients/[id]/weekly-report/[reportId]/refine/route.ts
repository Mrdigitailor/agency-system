import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { getWeeklyClientData, getWeeklyBreakdowns } from "@/lib/reports/weekly-data";
import { buildWeeklyDataText } from "@/lib/reports/generate";
import { detectClientFunnel } from "@/lib/agent/funnel-detect";
import { classifyBusinessType } from "@/lib/agent/business-knowledge";
import { shiftYmd } from "@/lib/utils/ildate";

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

  // שומרים את הערת המשתמש מיד — לפני כל שליפת נתונים/AI — כדי שלעולם לא תאבד
  await prisma.weeklyReportMessage.create({ data: { reportId, role: "user", content: note } });

  const respondWith = async (assistantMsg: string, revised: string | null, ok: boolean, status = 200) => {
    await prisma.weeklyReportMessage.create({ data: { reportId, role: "assistant", content: assistantMsg } });
    if (ok && revised) await prisma.weeklyReport.update({ where: { id: reportId }, data: { content: revised } });
    const messages = await prisma.weeklyReportMessage.findMany({ where: { reportId }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ content: revised ?? report.content, messages, ok }, { status });
  };

  // הקשר הנתונים — כדי שהתיקון יישאר מעוגן במספרים האמיתיים. עטוף כדי שכשל
  // בשליפה (ולא רק ב-AI) יחזיר משוב ברור במקום 500 שקט.
  let dataText: string;
  let currency = "ILS";
  try {
    const [profile, client] = await Promise.all([
      prisma.clientProfile.findUnique({ where: { clientId } }),
      prisma.client.findUnique({ where: { id: clientId }, select: { currency: true, clientType: true } }),
    ]);
    const format = profile?.weeklyReportFormat ?? "standard";
    const products: Array<{ name: string }> = profile ? JSON.parse(profile.products ?? "[]") : [];
    currency = client?.currency || "ILS";
    const [data, prevData, funnelDetection, breakdowns] = await Promise.all([
      getWeeklyClientData(clientId, report.weekStart, report.weekEnd),
      getWeeklyClientData(clientId, shiftYmd(report.weekStart, -7), shiftYmd(report.weekEnd, -7)),
      detectClientFunnel(clientId, { until: report.weekEnd }),
      getWeeklyBreakdowns(clientId, report.weekStart, report.weekEnd),
    ]);
    const campaignFunnels =
      classifyBusinessType(client?.clientType) === "leads" ? funnelDetection.metaCampaigns : undefined;
    dataText = buildWeeklyDataText(data, format, products, currency, prevData, campaignFunnels, breakdowns);
  } catch (err) {
    console.error("[WeeklyReport refine] data step", err);
    const reason = err instanceof Error ? err.message.slice(0, 120) : "שגיאה לא ידועה";
    return respondWith(`❌ התיקון נכשל בשליפת הנתונים — ההערה שלך נשמרה, נסה שוב.\n(סיבה: ${reason})`, null, false);
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system:
        "אתה עורך דוח שבועי קיים של סוכנות שיווק לפי הערת המשתמש. " +
        "החזר אך ורק את הדוח המלא המעודכן ב-Markdown בעברית (בלי הקדמות כמו 'הנה הדוח'). " +
        "שמור על עיגון מוחלט בנתונים שסופקו — אל תמציא מספרים. " +
        `כל הסכומים במטבע ${currency} בלבד. אל תשתמש בטבלאות Markdown — רשימות תבליטים בפורמט "מדד: ערך". ` +
        "כללי קריאוּת: אל תציג שמות קמפיינים גולמיים (עם ||, קידומות, תאריכים) — חלץ את שם המוצר/ההצעה בלבד; " +
        'שורה אחת לקמפיין בתבנית "שם — תוצאה · עלות · מגמה" עם 🟢/🔴/🆕; השוואות בקצרה "(היה ₪X)" בלי סוגריים כפולים; ' +
        "קמפיינים בלי תוצאות — שורה מאוחדת אחת; סכומים מעוגלים לשלמים.",
      messages: [
        {
          role: "user",
          content:
            `הדוח הנוכחי:\n\n${report.content}\n\n---\n\nהנתונים בפועל (לעיגון):\n${dataText}\n\n---\n\n` +
            `הערת תיקון: ${note}\n\nהחזר את הדוח המלא המעודכן.`,
        },
      ],
    }, { timeout: 45_000, maxRetries: 1 }); // גבול-זמן מפורש כדי לא להיהרג ע"י ה-serverless (60ש')

    const block = response.content.find((b) => b.type === "text");
    const revised = block && "text" in block ? block.text.trim() : "";
    if (!revised) return respondWith("❌ לא הצלחתי לעדכן את הדוח — נסה לשלוח את ההערה שוב.", null, false);

    return respondWith("✅ עדכנתי את הדוח לפי ההערה.", revised, true);
  } catch (err) {
    console.error("[WeeklyReport refine]", err);
    // ההערה כבר נשמרה — מחזירים משוב ברור (כולל סיבה) בלי לאבד אותה
    const reason = err instanceof Error ? err.message.slice(0, 120) : "שגיאה לא ידועה";
    return respondWith(`❌ התיקון נכשל — ההערה שלך נשמרה, נסה שוב.\n(סיבה: ${reason})`, null, false);
  }
}
