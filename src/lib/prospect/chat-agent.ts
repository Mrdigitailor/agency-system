// סוכן הצ'אט של דף הנחיתה — מנהל את השיחה לפי התסריט המאושר.
// התסריט: https://claude.ai/artifact/UnUzPgFbuABmanidfa9zWy
// ארכיטקטורה: Claude עם ארבעה כלים. כל מספר מגיע מהמנוע, לא מהמודל.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { createAndRunReport } from "./create-report";
import { getFreeSlots, bookSlot } from "./scheduling";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = process.env.CHAT_AI_MODEL ?? "claude-sonnet-4-6";
const APP_BASE = process.env.APP_BASE_URL ?? "https://agency.mr-digitailor.co.il";

const MAX_TURNS = 8;          // תקרת סבבי כלים בתוך תור אחד
const HISTORY_WINDOW = 40;    // כמה הודעות אחרונות נשלחות למודל

// ---------- פרומפט המערכת: התסריט המאושר + כללי הברזל ----------
const SYSTEM_PROMPT = `אתה העוזר הדיגיטלי של Mr.digitailor, סוכנות שיווק ישראלית. אתה מנהל שיחה עם בעל עסק שהגיע לדף הנחיתה שלנו, במטרה להראות לו במספרים אמיתיים מה גוגל יכולה לייצר לעסק שלו, ולקבוע איתו פגישת ניתוח של 30 דקות בזום עם סער, הבעלים.

## מהלך השיחה (בסדר הזה)
1. פתיחה: כבר נשלחה. אם שואל "מי אתם": אנחנו סוכנות שמתמחה במשפכי לקוחות מגוגל: דף נחיתה, קמפיין, וסוכן חכם שמנהל הכל, במחיר של עשירית ממנהל קמפיינים אנושי. ואז חוזרים לשיחה.
2. שאל במה העסק שלו עוסק (טקסט חופשי). אם לא ברור, שאלת חידוד אחת בלבד.
3. שאל איפה הוא נותן שירות. הצע כפתורים: כל הארץ | אזור מסוים | הכל אונליין.
4. שאל איך הוא גובה: תשלום חד פעמי | ריטיינר חודשי.
   אם חד פעמי: כמה שווה עסקה ממוצעת (כפתורים: עד 1,500 ₪ | 1,500 עד 5,000 | 5,000 עד 15,000 | מעל 15,000). קח את אמצע הטווח כערך.
   אם ריטיינר: כמה בחודש וכמה זמן לקוח נשאר בממוצע. אם מזכיר גם דמי הקמה, שמור אותם כ-dealFirst.
5. שאל כמה היה רוצה להשקיע בפרסום בחודש (כפתורים: עד 3,000 ₪ | 3,000 עד 5,000 | 5,000 עד 10,000 | מעל 10,000 | עוד לא החלטתי). קח אמצע טווח. אם "עוד לא החלטתי": אמור שתחשב לפי 5,000 ₪ כנקודת פתיחה.
6. אחרי שיש תחום + תקציב + נתוני עסקה: אמור "אני ניגש עכשיו לגוגל לבדוק את התחום שלך בזמן אמת. תן לי בערך 15 שניות" וקרא לכלי run_research באותו תור.
7. כשהמחקר חוזר: הצג את הטיזר בדיוק במבנה הזה (עם המספרים שקיבלת מהכלי, לעולם לא מספרים משלך):
   "יש לי את המספרים שלך 👇
   🔍 [נפח] חיפושים בחודש של אנשים שמחפשים בדיוק את מה שאתה עושה
   💰 תקציב של [תקציב] ₪ יכול לייצר אצלך בין [נמוך] ל-[גבוה] ₪ בחודש
   הכנתי לך דוח מלא עם כל הפירוק. לאן לשלוח?"
   ואז אסוף בזה אחר זה: שם, אימייל, טלפון. אחרי כל פרט קרא ל-save_profile.
8. אחרי הטלפון: מסור את קישור הדוח (מהכלי) ואמור ששלחת גם למייל. ואז הצע את הפגישה: "בפגישת זום של 30 דקות אני אעבור איתך על הניתוח, נסתכל יחד על הקמפיינים והמתחרים בשידור חי, ותצא עם תמונה ברורה, בין אם נעבוד יחד ובין אם לא." וקרא ל-get_slots והצג עד 5 מועדים ככפתורים + "מועדים נוספים" + "לא כרגע".
9. כשבוחר מועד: קרא ל-book_meeting. אשר: "נקבע! 📅 [מועד]. הזמנה עם קישור הזום כבר בדרך למייל שלך."
10. אם "לא כרגע": "אין שום בעיה. הדוח אצלך במייל, קח את הזמן לעבור עליו. אני נשאר כאן אם תרצה לשאול משהו על המספרים." והישאר זמין לשאלות.
11. אם המחקר החזיר no_data: "האמת? התחום שלך מיוחד. המספרים שגוגל מחזירה עליו לא מספיק אמינים, ואני מעדיף להגיד לך את זה בכנות מאשר לזרוק הערכה באוויר. בדיוק בשביל מקרים כאלה יש את סער." והצע פגישה ישירות (אסוף קודם שם ואימייל).

## כללי ברזל
- לעולם אל תמציא מספרים. כל מספר על התחום שלו מגיע אך ורק מכלי run_research. אין נתונים = אין מספרים.
- לעולם אל תבטיח תוצאות. תמיד "פוטנציאל", "יכול לייצר". לא "תרוויח".
- לעולם אל תציג הכנסה אפס או שברי עסקאות.
- אם שואל על המחיר שלנו: ענה בכנות: הקמה 14,800 ₪ + 800 ₪ בחודש לניהול השוטף, מול 2,500 ₪ ומעלה לקמפיינר אנושי. אל תתחמק ואל תלחץ.
- שאלות שלא קשורות לשיווק ולעסק: החזר בעדינות לנושא.
- עברית טבעית וחמה. משפטים קצרים. בלי מקפים ארוכים (לא — ולא -). התאם לשון פנייה לפי הכתיבה של המשתמש.
- שמור כל פרט שנאסף מיד עם save_profile, גם באמצע שיחה.
- שאלה אחת בכל הודעה. אל תחזור על שאלה שכבר נענתה.

## פורמט
בסוף כל הודעה שיש בה בחירה סגורה, הוסף שורה אחרונה בפורמט המדויק:
[כפתורים: אפשרות 1 | אפשרות 2 | אפשרות 3]
כשמציג מועדי פגישה, כל כפתור הוא התווית המדויקת של המועד מהכלי.`;

// ---------- כלים ----------
const TOOLS: Anthropic.Tool[] = [
  {
    name: "save_profile",
    description: "שומר פרטים שנאספו בשיחה. קרא מיד כשמתקבל פרט חדש, גם באמצע. שלח רק שדות שידועים.",
    input_schema: {
      type: "object",
      properties: {
        serviceField: { type: "string", description: "תחום/שירות העסק" },
        serviceArea: { type: "string", description: "אזור שירות" },
        paymentType: { type: "string", enum: ["one_time", "retainer"] },
        dealFirst: { type: "number", description: "שווי עסקה/דמי הקמה בש\"ח" },
        monthlyFee: { type: "number", description: "ריטיינר חודשי בש\"ח" },
        lifetimeMonths: { type: "number", description: "אורך חיי לקוח בחודשים" },
        budget: { type: "number", description: "תקציב פרסום חודשי בש\"ח" },
        name: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
        businessName: { type: "string", description: "שם העסק אם הוזכר" },
      },
    },
  },
  {
    name: "run_research",
    description: "מריץ מחקר מילות מפתח חי בגוגל ומחשב את הפוטנציאל. קרא רק אחרי שיש תחום, תקציב ונתוני עסקה. לוקח כ-15 שניות.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_slots",
    description: "מחזיר מועדי פגישה פנויים מהיומן של סער.",
    input_schema: { type: "object", properties: { offset: { type: "number", description: "0 לחמשת הראשונים, 5 לבאים" } } },
  },
  {
    name: "book_meeting",
    description: "קובע את הפגישה. דורש שם ואימייל שמורים ומועד (startIso מהכלי get_slots).",
    input_schema: { type: "object", properties: { startIso: { type: "string" } }, required: ["startIso"] },
  },
];

// ---------- טיפוסים ----------
export interface ChatFields {
  serviceField?: string; serviceArea?: string; paymentType?: string;
  dealFirst?: number; monthlyFee?: number; lifetimeMonths?: number; budget?: number;
  name?: string; email?: string; phone?: string; businessName?: string;
  reportToken?: string; reportStatus?: string;
  slots?: Array<{ startIso: string; label: string }>;
  meetingAt?: string;
}
interface StoredMessage { role: "user" | "assistant"; content: string; at: string }

const parse = <T,>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T; } catch { return fallback; } };

// ---------- ביצוע כלי ----------
async function execTool(chatId: string, fields: ChatFields, name: string, input: Record<string, unknown>): Promise<{ result: string; fields: ChatFields }> {
  const f = { ...fields };

  if (name === "save_profile") {
    for (const k of ["serviceField", "serviceArea", "paymentType", "name", "email", "phone", "businessName"] as const) {
      if (typeof input[k] === "string" && (input[k] as string).trim()) f[k] = (input[k] as string).trim().slice(0, 200);
    }
    for (const k of ["dealFirst", "monthlyFee", "lifetimeMonths", "budget"] as const) {
      if (typeof input[k] === "number" && input[k] as number >= 0) f[k] = input[k] as number;
    }
    if (f.email) f.email = f.email.toLowerCase();
    // עדכון פרטי קשר גם על הדוח אם כבר נוצר
    const report = await prisma.potentialReport.findFirst({ where: { token: f.reportToken ?? "" } });
    if (report) {
      await prisma.potentialReport.update({
        where: { id: report.id },
        data: {
          contactName: f.name ?? report.contactName,
          contactEmail: f.email ?? report.contactEmail,
          contactPhone: f.phone ?? report.contactPhone,
          businessName: f.businessName ?? report.businessName,
        },
      }).catch(() => {});
    }
    return { result: JSON.stringify({ saved: true, known: Object.keys(f) }), fields: f };
  }

  if (name === "run_research") {
    if (!f.serviceField || !f.budget) return { result: JSON.stringify({ error: "חסר תחום או תקציב" }), fields: f };
    const r = await createAndRunReport({
      businessName: f.businessName, serviceField: f.serviceField, serviceArea: f.serviceArea,
      budget: f.budget, paymentType: f.paymentType === "retainer" ? "retainer" : "one_time",
      dealFirst: f.dealFirst, monthlyFee: f.monthlyFee, lifetimeMonths: f.lifetimeMonths,
      contactName: f.name, contactEmail: f.email, contactPhone: f.phone,
    });
    f.reportToken = r.token;
    f.reportStatus = r.status;
    await prisma.prospectChat.update({ where: { id: chatId }, data: { reportId: r.reportId } }).catch(() => {});
    if (r.status !== "ready" || !r.chain) {
      return { result: JSON.stringify({ status: r.status, reason: r.reason ?? "" }), fields: f };
    }
    const c = r.chain;
    const firstBasis = c.dealValueFirst > 0;
    const low = Math.ceil(Math.max(firstBasis ? c.revenueFirst.head : c.revenueFull.head, 0) / 100) * 100;
    const high = Math.ceil(Math.max(firstBasis ? c.revenueFirst.best : c.revenueFull.best, 0) / 100) * 100;
    return {
      result: JSON.stringify({
        status: "ready",
        monthlySearches: r.totalVol,
        budget: f.budget,
        revenueLowIls: low, revenueHighIls: high,
        revenueBasis: firstBasis ? "עסקאות ראשונות" : "שווי לקוח מלא",
        reportUrl: `${APP_BASE}/report/${r.token}`,
      }),
      fields: f,
    };
  }

  if (name === "get_slots") {
    const offset = typeof input.offset === "number" ? Math.max(0, Math.floor(input.offset)) : 0;
    const slots = await getFreeSlots();
    f.slots = slots;
    return { result: JSON.stringify({ slots: slots.slice(offset, offset + 5) }), fields: f };
  }

  if (name === "book_meeting") {
    const startIso = String(input.startIso ?? "");
    if (!f.name || !f.email) return { result: JSON.stringify({ error: "חסרים שם או אימייל" }), fields: f };
    const report = f.reportToken ? await prisma.potentialReport.findFirst({ where: { token: f.reportToken } }) : null;
    const r = await bookSlot({ startIso, name: f.name, email: f.email, phone: f.phone, reportId: report?.id });
    if (r.ok) f.meetingAt = r.meetingAt;
    return { result: JSON.stringify(r), fields: f };
  }

  return { result: JSON.stringify({ error: "unknown tool" }), fields: f };
}

// ---------- תור שיחה מלא ----------
export interface TurnResult { reply: string; quickReplies: string[]; researching: boolean }

/** מפריד את שורת הכפתורים מהטקסט */
function splitQuickReplies(text: string): { reply: string; quickReplies: string[] } {
  const m = text.match(/\[כפתורים:\s*([^\]]+)\]\s*$/);
  if (!m) return { reply: text.trim(), quickReplies: [] };
  return {
    reply: text.replace(m[0], "").trim(),
    quickReplies: m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 8),
  };
}

export const OPENING_MESSAGE = "היי 👋 אני העוזר הדיגיטלי של Mr.digitailor.\nתוך שתי דקות אני יכול להראות לך, במספרים אמיתיים מגוגל, כמה לקוחות והכנסות העסק שלך יכול להוציא מקמפיין חכם. שנבדוק?";
export const OPENING_REPLIES = ["יאללה, בוא נבדוק", "רגע, מי אתם בכלל?"];

export async function runChatTurn(chatId: string, userMessage: string): Promise<TurnResult> {
  const chat = await prisma.prospectChat.findUnique({ where: { id: chatId } });
  if (!chat) throw new Error("chat not found");

  const history = parse<StoredMessage[]>(chat.messages, []);
  let fields = parse<ChatFields>(chat.fields, {});

  history.push({ role: "user", content: userMessage.slice(0, 1000), at: new Date().toISOString() });

  // הקשר למודל: מה כבר ידוע (כדי שלא ישאל שוב אחרי רענון)
  const known = Object.entries(fields)
    .filter(([k, v]) => v !== undefined && k !== "slots")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
  const system = `${SYSTEM_PROMPT}\n\n## מצב נוכחי\nפרטים שכבר נאספו: ${known || "עדיין כלום"}`;

  const msgs: Anthropic.MessageParam[] = [
    { role: "assistant", content: OPENING_MESSAGE },
    ...history.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
  ];

  let researching = false;
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 1000, system, messages: msgs, tools: TOOLS,
    });

    const textParts = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUses.length === 0) {
      finalText = textParts.join("\n").trim();
      break;
    }

    msgs.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === "run_research") researching = true;
      const { result, fields: nf } = await execTool(chatId, fields, tu.name, (tu.input ?? {}) as Record<string, unknown>);
      fields = nf;
      results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    msgs.push({ role: "user", content: results });
  }

  if (!finalText) finalText = "סליחה, משהו השתבש אצלי. אפשר לנסות שוב?";
  finalText = finalText.replace(/[—–]/g, "-"); // ביטחון: בלי מקפים ארוכים

  const { reply, quickReplies } = splitQuickReplies(finalText);
  history.push({ role: "assistant", content: finalText, at: new Date().toISOString() });

  await prisma.prospectChat.update({
    where: { id: chatId },
    data: { messages: JSON.stringify(history.slice(-120)), fields: JSON.stringify(fields) },
  });

  return { reply, quickReplies, researching };
}
