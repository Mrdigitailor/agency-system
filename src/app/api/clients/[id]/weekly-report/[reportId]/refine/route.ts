import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { getWeeklyClientData, getWeeklyBreakdowns } from "@/lib/reports/weekly-data";
import { buildWeeklyDataText } from "@/lib/reports/generate";
import { detectClientFunnel } from "@/lib/agent/funnel-detect";
import { classifyBusinessType } from "@/lib/agent/business-knowledge";
import { shiftYmd } from "@/lib/utils/ildate";

// דוחות ארוכים לוקחים ל-Claude 60-70ש' — 60ש' הרגו את הפונקציה. מרחיבים (Vercel Pro/Railway).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.REPORT_AI_MODEL ?? "claude-sonnet-4-6";

/**
 * אם הערת המשתמש היא הנחיה קבועה על אופן כתיבת הדוח (טון/פורמט/מה לכלול או להשמיט) —
 * מזקק אותה למשפט הנחיה כללי ומצרף אותו ל-ClientProfile.weeklyReportInstructions,
 * כך שהיא תחול על כל הדוחות הבאים של הלקוח. תיקוני-תוכן חד-פעמיים ("תקן את המספר",
 * "מחק את הפסקה") מוחזרים ריקים ולא נשמרים. מחזיר את ההנחיה שנשמרה, או null.
 */
async function maybePersistInstruction(clientId: string, note: string): Promise<string | null> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system:
      "מקבלים הערה שמשתמש כתב על טיוטת דוח שבועי. החלט אם זו הנחיה קבועה על אופן כתיבת הדוחות " +
      "(טון, פורמט, מבנה, מה לכלול/להשמיט, אורך, סגנון) — שרלוונטית לכל דוח עתידי — או תיקון חד-פעמי " +
      "שקשור רק לדוח/לשבוע הספציפי הזה (מספר, פסקה, טעות נקודתית). " +
      "אם זו הנחיה קבועה: החזר משפט הנחיה כללי אחד בעברית, בציווי, בלי התייחסות לשבוע הספציפי. " +
      "אם זה תיקון חד-פעמי: החזר בדיוק את המילה NONE.",
    messages: [{ role: "user", content: note }],
  }, { timeout: 30_000, maxRetries: 1 });

  const block = res.content.find((b) => b.type === "text");
  const distilled = block && "text" in block ? block.text.trim() : "";
  if (!distilled || distilled === "NONE" || distilled.length < 3) return null;

  const profile = await prisma.clientProfile.findUnique({ where: { clientId }, select: { weeklyReportInstructions: true } });
  const existing = (profile?.weeklyReportInstructions ?? "").trim();
  // מניעת כפילויות בסיסית
  if (existing.includes(distilled)) return distilled;
  const merged = existing ? `${existing}\n- ${distilled}` : `- ${distilled}`;

  await prisma.clientProfile.upsert({
    where: { clientId },
    update: { weeklyReportInstructions: merged },
    create: { clientId, weeklyReportInstructions: merged },
  });
  return distilled;
}

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
        "הדוח נשלח ישירות ללקוח: לעולם אל תבקר את העבודה של הסוכנות ואל תשתמש במילים כמו 'גרוע'/'כישלון'/'בזבוז'/'מאכזב'; " +
        "מדד שירד או קמפיין חלש מתוארים בשפה עניינית וצופה-פני-עתיד (מה זיהינו ומה נעשה בשבוע הקרוב), וההמלצות נכתבות כתוכנית הפעולה שלנו ('נבחן', 'נדייק'). " +
        "שמור על עיגון מוחלט בנתונים שסופקו — אל תמציא מספרים. " +
        `כל הסכומים במטבע ${currency} בלבד. אל תשתמש בטבלאות Markdown — רשימות תבליטים בפורמט "מדד: ערך". ` +
        "כללי קריאוּת: אל תציג שמות קמפיינים גולמיים (עם ||, קידומות, תאריכים) — חלץ את שם המוצר/ההצעה בלבד; " +
        'שורה אחת לקמפיין בתבנית "שם — תוצאה · עלות · מגמה" עם 🟢/🔴/🆕; השוואות בקצרה "(היה ₪X)" בלי סוגריים כפולים; ' +
        "קמפיינים בלי תוצאות — שורה מאוחדת אחת; סכומים מעוגלים לשלמים. " +
        "לעולם אל תכתוב שחסרים נתונים או 'יש לספק נתונים' — זה דוח ללקוח; אם נתון חסר, השמט אותו בשקט. " +
        "רכישות הן נתון נפרד מלידים — השתמש אך ורק במספר הרכישות שסופק, אל תנחש ואל תערבב עם לידים. " +
        "שפה: עברית טבעית ושיחתית כמו הסבר בטלפון, בלי ניסוחים מתורגמים/מוזרים. על הוצאה כתוב 'ניצלנו X בתקציב הפרסום' — לעולם לא 'הכנסנו X לעבודה'.",
      messages: [
        {
          role: "user",
          content:
            `הדוח הנוכחי:\n\n${report.content}\n\n---\n\nהנתונים בפועל (לעיגון):\n${dataText}\n\n---\n\n` +
            `הערת תיקון: ${note}\n\nהחזר את הדוח המלא המעודכן.`,
        },
      ],
    }, { timeout: 240_000, maxRetries: 0 }); // בתוך תקציב ה-maxDuration (300ש'), בלי retries שמכפילים זמן

    const block = response.content.find((b) => b.type === "text");
    const revised = block && "text" in block ? block.text.trim() : "";
    if (!revised) return respondWith("❌ לא הצלחתי לעדכן את הדוח — נסה לשלוח את ההערה שוב.", null, false);

    // אם ההערה היא הנחיה קבועה על אופן כתיבת הדוח — לשמור אותה כך שתחול על כל הדוחות
    // הבאים של הלקוח (ולא רק על הדוח הזה). תיקוני-תוכן חד-פעמיים אינם נשמרים.
    const persisted = await maybePersistInstruction(clientId, note).catch((e) => {
      console.error("[WeeklyReport refine] persist instruction failed:", e);
      return null;
    });

    const msg = persisted
      ? `✅ עדכנתי את הדוח, ושמרתי את ההנחיה לכל הדוחות הבאים של הלקוח:\n💡 "${persisted}"`
      : "✅ עדכנתי את הדוח לפי ההערה.";
    return respondWith(msg, revised, true);
  } catch (err) {
    console.error("[WeeklyReport refine]", err);
    // ההערה כבר נשמרה — מחזירים משוב ברור (כולל סיבה) בלי לאבד אותה
    const reason = err instanceof Error ? err.message.slice(0, 120) : "שגיאה לא ידועה";
    return respondWith(`❌ התיקון נכשל — ההערה שלך נשמרה, נסה שוב.\n(סיבה: ${reason})`, null, false);
  }
}
