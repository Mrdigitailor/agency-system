// סוכן הצ'אט של דף הנחיתה — מנהל את השיחה לפי התסריט המאושר.
// התסריט: https://claude.ai/artifact/UnUzPgFbuABmanidfa9zWy
// ארכיטקטורה: Claude עם ארבעה כלים. כל מספר מגיע מהמנוע, לא מהמודל.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { createAndRunReport } from "./create-report";
import { getFreeSlots, bookSlot } from "./scheduling";
import { maybeSendReportEmail } from "./emails";
import { PRIVACY_VERSION } from "./privacy";
import { upsertProspectLead } from "./crm-lead";
import { notifyNewLead, notifyMeetingBooked } from "./portal-notify";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = process.env.CHAT_AI_MODEL ?? "claude-sonnet-4-6";
const APP_BASE = process.env.APP_BASE_URL ?? "https://agency.mr-digitailor.co.il";

const MAX_TURNS = 8;          // תקרת סבבי כלים בתוך תור אחד
const HISTORY_WINDOW = 40;    // כמה הודעות אחרונות נשלחות למודל

// ---------- פרומפט המערכת: התסריט המאושר + כללי הברזל ----------
const PRIVACY_URL = `${APP_BASE}/privacy`;

const SYSTEM_PROMPT = `אתה העוזר הדיגיטלי של Mr.digitailor, סוכנות שיווק ישראלית. אתה מנהל שיחה עם בעל עסק שהגיע לדף הנחיתה שלנו, במטרה להראות לו במספרים אמיתיים מה גוגל יכולה לייצר לעסק שלו, ולקבוע איתו פגישת ניתוח של 30 דקות בזום עם סער, הבעלים.

## מהלך השיחה (בסדר הזה)
1. פתיחה: כבר נשלחה. אם שואל "מי אתם": אנחנו סוכנות שמתמחה במשפכי לקוחות מגוגל: דף נחיתה, קמפיין, וסוכן חכם שמנהל הכל, במחיר של עשירית ממנהל קמפיינים אנושי. ואז חוזרים לשיחה.
2. קודם כל שם: "לפני שנצלול, איך קוראים לך?" שמור עם save_profile, והשתמש בשם הפרטי באופן טבעי בהמשך (לא בכל הודעה).
3. שאל במה העסק שלו עוסק (טקסט חופשי). אם לא ברור, שאלת חידוד אחת בלבד.
4. שאל איפה הוא נותן שירות. כפתורים: כל הארץ | אזור מסוים | הכל אונליין.
5. שאל איך הוא גובה: תשלום חד פעמי | ריטיינר חודשי.
   אם חד פעמי: כמה שווה עסקה ממוצעת (כפתורים: עד 1,500 ₪ | 1,500 עד 5,000 | 5,000 עד 15,000 | מעל 15,000). קח את אמצע הטווח כערך.
   אם ריטיינר: כמה בחודש וכמה זמן לקוח נשאר בממוצע. אם מזכיר גם דמי הקמה, שמור אותם כ-dealFirst.
6. שאל כמה היה רוצה להשקיע בפרסום בחודש (כפתורים: עד 3,000 ₪ | 3,000 עד 5,000 | 5,000 עד 10,000 | מעל 10,000 | עוד לא החלטתי). קח אמצע טווח. אם "עוד לא החלטתי": אמור שתחשב לפי 5,000 ₪ כנקודת פתיחה.
7. ברגע שיש תחום + תקציב + נתוני עסקה: קרא לכלי run_research מיד, בלי לכתוב שום טקסט. המערכת תודיע למשתמש שהמחקר רץ.
8. כשמגיעה הודעת [מערכת] עם תוצאות המחקר: הצג את הטיזר בדיוק במבנה הזה (רק עם המספרים מההודעה):
   "[שם], יש לי את המספרים שלך 👇
   🔍 [monthlySearches] חיפושים בחודש של אנשים שמחפשים בדיוק את מה שאתה עושה
   💰 תקציב של [budget] ₪ יכול לייצר אצלך [revenueText בדיוק כפי שהתקבל] בחודש
   הכנתי לך דוח מלא עם כל הפירוק של המספרים. לאיזה מייל לשלוח לך אותו?

   ודבר קטן, כי החוק מחייב אותי להגיד אותו (אני יודע, נשמע רשמי 🙂): כשמשאירים מייל מאשרים את מדיניות הפרטיות שלנו. בפועל זה אומר שאשלח לך את הדוח ועוד כמה מיילים עם תובנות על השיווק שלך, ואפשר להסיר את עצמך בלחיצה אחת מתי שרוצים. הכול כתוב כאן: ${PRIVACY_URL}"
   את פסקת ההסכמה והקישור מציגים בדיוק כך, מילה במילה, ורק פעם אחת בשיחה. אם שואלים על פרטיות או על מה עושים עם הפרטים: ענה בקצרה ובכנות (הדוח, תיאום פגישה, כמה מיילים עם תובנות, הסרה בלחיצה, לא מוכרים מידע) והפנה שוב לקישור.
9. כשנותן מייל: שמור עם save_profile, ובאותה הודעה חובה למסור את קישור הדוח (reportUrl): "מעולה, הדוח שלך כאן 👇
[הקישור המלא]
כנס, צפה בדוח, תבין את הפוטנציאל שלך ותראה בדיוק איך הגענו לכל מספר. ואז תחזור אליי לכאן, אני מחכה לך 😉
[כפתורים: מצוין, עברתי על הדוח]" אל תטען ששלחת במייל, ואל תוסיף עוד שאלות באותה הודעה. ברגע שהוא חוזר וכותב כל דבר, המשך לשלב 10.
10. הכנה לפגישה, לפני שמציעים מועדים. הסבר מה זה ולמה שווה לו: "המספרים בדוח הם הפוטנציאל. השאלה האמיתית היא איך מגיעים אליהם אצלך, ובשביל זה יש את סער. בפגישת זום של 30 דקות הוא עובר איתך על הניתוח, מסתכל יחד איתך על המתחרים שלך בשידור חי, ואתה יוצא עם תמונה ברורה מה צריך לקרות, בין אם נעבוד יחד ובין אם לא. בלי עלות ובלי מחויבות. שווה לך?" כפתורים: יאללה, מתי אפשר? | לא כרגע.
11. אם מסכים: קרא get_slots (offset 0) והצג את כל המועדים שחזרו ככפתורים: שני ימים, שלושה חלונות בכל יום. כל כפתור הוא התווית המדויקת של המועד מהכלי. הוסף כפתור אחרון "מועדים נוספים", ואם נלחץ קרא get_slots עם offset גבוה יותר (2, ואז 4, וכן הלאה).
12. כשבוחר מועד: לפני הקביעה בקש טלפון עם סיבה: "אחרון חביב, מה הטלפון שלך? רק למקרה שנצטרך לעדכן משהו לגבי הפגישה." כשמתקבל הטלפון: שמור אותו עם save_profile וקרא מיד book_meeting עם ה-startIso של המועד שהמשתמש בחר (הוא מופיע ברשימת המועדים שבמצב הנוכחי). לעולם אל תקרא get_slots שוב בשלב הזה ואל תבקש לבחור מועד מחדש. אחרי הצלחה אשר: "נקבע! 📅 [מועד]. הזמנה עם קישור הזום כבר בדרך למייל שלך. נתראה!"
13. אם "לא כרגע": אל תוותר מיד, אבל בלי לחץ. קודם הבן למה: "לגמרי בסדר. רק שאלה אחת כדי שלא אציק לך סתם: מה הסיבה העיקרית?" [כפתורים: אין לי זמן כרגע | רוצה לחשוב על זה | לא בטוח שזה בשבילי | משהו אחר]
   שמור את התשובה עם save_profile (declineReason), ואז תן מענה אחד כן וענייני להתנגדות, בלי להתווכח:
   - אין זמן: "מבין לגמרי. בדיוק בגלל זה הפגישה היא 30 דקות וזהו, בזום, בלי הכנות. ואם גם זה כבד עכשיו, סער יכול פשוט להתקשר אליך לכמה דקות כשנוח לך. מה עדיף?"
   - רוצה לחשוב: "לגמרי לגיטימי. הדוח אצלך ולא הולך לשום מקום. רוצה שאקפוץ לך תזכורת כאן בעוד כמה ימים, או שנקבע כבר עכשיו משהו לשבוע הבא ואם לא מתאים פשוט תבטל?"
   - לא בשבילי: "תודה על הכנות. אפשר לשאול מה הרגיש לא מתאים? זה עוזר לנו להשתפר, ואולי אני גם אפתיע אותך בתשובה."
   אם אחרי המענה עדיין מסרב: "אין שום בעיה, הדוח שלך אצלך ואפשר לחזור אליו מתי שתרצה. אם נוח לך שסער פשוט יתקשר אליך כשמתאים, השאר לי מספר טלפון ונסדר את זה." והישאר זמין לשאלות על הדוח. סירוב שני הוא סופי, אל תמשיך ללחוץ.
14. אם המחקר החזיר no_data: "[שם], האמת? התחום שלך מיוחד. המספרים שגוגל מחזירה עליו לא מספיק אמינים, ואני מעדיף להגיד לך את זה בכנות מאשר לזרוק הערכה באוויר. בדיוק בשביל מקרים כאלה יש את סער, שיבדוק את התחום שלך ידנית בפגישה קצרה." ואז עבור לשלב 10.

## כללי ברזל
- לעולם אל תמציא מספרים. כל מספר על התחום שלו מגיע אך ורק מתוצאות המחקר. אין נתונים = אין מספרים.
- לעולם אל תבטיח תוצאות. תמיד "פוטנציאל", "יכול לייצר". לא "תרוויח".
- לעולם אל תציג הכנסה אפס או שברי עסקאות.
- אם שואל על המחיר שלנו: ענה בכנות: הקמה 14,800 ₪ + 800 ₪ בחודש לניהול השוטף, מול 2,500 ₪ ומעלה לקמפיינר אנושי. אל תתחמק ואל תלחץ.
- שאלות שלא קשורות לשיווק ולעסק: החזר בעדינות לנושא.
- שאלה עניינית שאין לך עליה תשובה אמינה (ולא מופיעה בידע שנצבר): אל תמציא. קרא escalate_question, ענה שתבדוק ושסער יחזור עם תשובה, והמשך את השיחה.
- עברית טבעית וחמה. משפטים קצרים. בלי מקפים ארוכים. התאם לשון פנייה לפי הכתיבה של המשתמש.
- שמור כל פרט שנאסף מיד עם save_profile, גם באמצע שיחה.
- שאלה אחת בכל הודעה. אל תחזור על שאלה שכבר נענתה (בדוק במצב הנוכחי).

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
        declineReason: { type: "string", description: "הסיבה שנתן לסירוב לפגישה, במילים שלו" },
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
    description: "מחזיר מועדי פגישה פנויים מהיומן של סער: שני ימים קרובים, שלושה חלונות בכל יום.",
    input_schema: { type: "object", properties: { offset: { type: "number", description: "כמה ימים לדלג: 0 בפעם הראשונה, 2 למועדים נוספים, 4 לבאים" } } },
  },
  {
    name: "book_meeting",
    description: "קובע את הפגישה. דורש שם ואימייל שמורים ומועד (startIso מהכלי get_slots).",
    input_schema: { type: "object", properties: { startIso: { type: "string" } }, required: ["startIso"] },
  },
  {
    name: "escalate_question",
    description: "קרא כשנשאלת שאלה עניינית שאין לך עליה תשובה אמינה (על השירות, המחיר, תנאים, או כל דבר שלא מכוסה בידע שלך). השאלה תגיע למנהל, התשובה שלו תילמד לשיחות הבאות. אחרי הקריאה ענה למשתמש בכנות שתבדוק ותחזור אליו, והמשך את השיחה.",
    input_schema: { type: "object", properties: { question: { type: "string", description: "השאלה כפי שנשאלה, בניסוח ברור" } }, required: ["question"] },
  },
];

// ---------- טיפוסים ----------
export interface ChatFields {
  serviceField?: string; serviceArea?: string; paymentType?: string;
  dealFirst?: number; monthlyFee?: number; lifetimeMonths?: number; budget?: number;
  name?: string; email?: string; phone?: string; businessName?: string;
  declineReason?: string;
  consentAt?: string; consentVersion?: string; // מתי הושאר המייל אחרי הודעת ההסכמה, ולאיזו גרסת מדיניות
  reportToken?: string; reportStatus?: string; pendingResearch?: boolean;
  slots?: Array<{ startIso: string; label: string }>;
  meetingAt?: string;
}
interface StoredMessage { role: "user" | "assistant"; content: string; at: string }

const parse = <T,>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T; } catch { return fallback; } };

// ---------- ביצוע כלי ----------
async function execTool(chatId: string, fields: ChatFields, name: string, input: Record<string, unknown>): Promise<{ result: string; fields: ChatFields }> {
  const f = { ...fields };

  if (name === "save_profile") {
    for (const k of ["serviceField", "serviceArea", "paymentType", "name", "email", "phone", "businessName", "declineReason"] as const) {
      if (typeof input[k] === "string" && (input[k] as string).trim()) f[k] = (input[k] as string).trim().slice(0, 200);
    }
    for (const k of ["dealFirst", "monthlyFee", "lifetimeMonths", "budget"] as const) {
      if (typeof input[k] === "number" && input[k] as number >= 0) f[k] = input[k] as number;
    }
    if (f.email) f.email = f.email.toLowerCase();
    // תיעוד ההסכמה לדיוור: הרגע שבו נמסר המייל וגרסת המדיניות שהוצגה
    if (f.email && !f.consentAt) { f.consentAt = new Date().toISOString(); f.consentVersion = PRIVACY_VERSION; }
    // פרט קשר ראשון = ליד חדש: התראה מיידית לבעל הפורטל (נשלחת פעם אחת לשיחה)
    if (f.email || f.phone) {
      await notifyNewLead(chatId, { name: f.name, email: f.email, phone: f.phone, business: f.businessName || f.serviceField }).catch(() => {});
    }
    // עדכון פרטי קשר גם על הדוח אם כבר נוצר
    const report = await prisma.potentialReport.findFirst({ where: { token: f.reportToken ?? "" } });
    if (report) {
      const hadEmail = Boolean(report.contactEmail);
      await prisma.potentialReport.update({
        where: { id: report.id },
        data: {
          contactName: f.name ?? report.contactName,
          contactEmail: f.email ?? report.contactEmail,
          contactPhone: f.phone ?? report.contactPhone,
          businessName: f.businessName ?? report.businessName,
        },
      }).catch(() => {});
      // מייל חדש נקלט: שולחים את הדוח + פותחים ליד ב-CRM (ברקע, לא חוסם את השיחה)
      if (f.email && !hadEmail) {
        maybeSendReportEmail(report.id).catch(() => {});
        upsertProspectLead(report.id).catch(() => {});
      }
      // סיבת סירוב לפגישה נרשמת בכרטיס הליד — ככה לומדים ומשתפרים
      if (typeof input.declineReason === "string" && input.declineReason.trim() && report.leadId) {
        const reason = input.declineReason.trim().slice(0, 200);
        const lead = await prisma.lead.findUnique({ where: { id: report.leadId } }).catch(() => null);
        if (lead) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              notes: `${lead.notes}\nסירב לפגישה בצ'אט: ${reason}`.trim(),
              nextActionType: "followup",
              nextActionNote: `סירב לפגישה: ${reason}`,
            },
          }).catch(() => {});
        }
      }
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
    // מקור ההגעה של השיחה מועתק לדוח — ככה הדשבורד יודע איזה קמפיין/מונח הביא כל ליד
    const chatRow = await prisma.prospectChat.findUnique({ where: { id: chatId } }).catch(() => null);
    if (chatRow?.source && chatRow.source !== "{}") {
      await prisma.potentialReport.update({ where: { id: r.reportId }, data: { sourceJson: chatRow.source } }).catch(() => {});
    }
    if (r.status !== "ready" || !r.chain) {
      return { result: JSON.stringify({ status: r.status, reason: r.reason ?? "" }), fields: f };
    }
    const c = r.chain;
    const firstBasis = c.dealValueFirst > 0;
    const low = Math.ceil(Math.max(firstBasis ? c.revenueFirst.head : c.revenueFull.head, 0) / 100) * 100;
    const high = Math.ceil(Math.max(firstBasis ? c.revenueFirst.best : c.revenueFull.best, 0) / 100) * 100;
    const revenueText = low === high
      ? `סביב ${low.toLocaleString("he-IL")} ₪`
      : `בין ${low.toLocaleString("he-IL")} ל-${high.toLocaleString("he-IL")} ₪`;
    return {
      result: JSON.stringify({
        status: "ready",
        monthlySearches: r.totalVol,
        budget: f.budget,
        revenueText, // להציג מילה במילה
        revenueBasis: firstBasis ? "עסקאות ראשונות" : "שווי לקוח מלא",
        reportUrl: `${APP_BASE}/report/${r.token}`,
      }),
      fields: f,
    };
  }

  if (name === "get_slots") {
    const dayOffset = typeof input.offset === "number" ? Math.max(0, Math.floor(input.offset)) : 0;
    const all = await getFreeSlots();
    f.slots = all;
    // הצעה של שני ימים, שלושה חלונות מפוזרים בכל יום (בוקר, אמצע, סוף)
    const dayKeys: string[] = [];
    const byDay = new Map<string, typeof all>();
    for (const s of all) {
      const day = s.label.split("·")[0].trim();
      if (!byDay.has(day)) { byDay.set(day, []); dayKeys.push(day); }
      byDay.get(day)!.push(s);
    }
    const offered = dayKeys.slice(dayOffset, dayOffset + 2).flatMap((d) => {
      const list = byDay.get(d)!;
      const idx = [...new Set([0, Math.floor(list.length / 2), list.length - 1])];
      return idx.map((i) => list[i]);
    });
    return {
      result: JSON.stringify({ slots: offered, moreDays: dayKeys.length > dayOffset + 2, nextOffset: dayOffset + 2 }),
      fields: f,
    };
  }

  if (name === "book_meeting") {
    const startIso = String(input.startIso ?? "");
    if (!f.name || !f.email) return { result: JSON.stringify({ error: "חסרים שם או אימייל" }), fields: f };
    const report = f.reportToken ? await prisma.potentialReport.findFirst({ where: { token: f.reportToken } }) : null;
    const r = await bookSlot({ startIso, name: f.name, email: f.email, phone: f.phone, reportId: report?.id, business: f.businessName || f.serviceField });
    if (r.ok) {
      f.meetingAt = r.meetingAt; f.slots = undefined;
      if (r.meetingAt) {
        await notifyMeetingBooked(chatId, { name: f.name, email: f.email, phone: f.phone, business: f.businessName || f.serviceField }, r.meetingAt).catch(() => {});
      }
    }
    return { result: JSON.stringify(r), fields: f };
  }

  if (name === "escalate_question") {
    const question = String(input.question ?? "").trim().slice(0, 500);
    if (question) {
      const owner = await prisma.prospectChat.findUnique({ where: { id: chatId }, select: { portalId: true } }).catch(() => null);
      await prisma.chatEscalation.create({ data: { chatId, portalId: owner?.portalId ?? null, question } }).catch(() => {});
      console.log(`[ChatAgent] escalation logged: ${question.slice(0, 80)}`);
    }
    return { result: JSON.stringify({ noted: true, guidance: "ענה בכנות שאין לך תשובה מדויקת כרגע, שהשאלה הועברה לסער והוא יחזור עם תשובה, והמשך את השיחה מאיפה שהייתם." }), fields: f };
  }

  return { result: JSON.stringify({ error: "unknown tool" }), fields: f };
}

// ---------- תור שיחה מלא ----------
// events: אבני הדרך שהושגו בתור הזה. הדף שולח אותן ל-Tag Manager, ומשם להמרות בגוגל אדס.
export type FunnelEvent = "funnel_numbers_shown" | "funnel_lead" | "funnel_meeting_booked";
export interface TurnResult { reply: string; quickReplies: string[]; researching: boolean; events: FunnelEvent[] }

/** מפריד את שורת הכפתורים מהטקסט */
function splitQuickReplies(text: string): { reply: string; quickReplies: string[] } {
  const m = text.match(/\[כפתורים:\s*([^\]]+)\]\s*$/);
  if (!m) return { reply: text.trim(), quickReplies: [] };
  return {
    reply: text.replace(m[0], "").trim(),
    quickReplies: m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 8),
  };
}

export const RESEARCH_ANNOUNCEMENT = "אני ניגש עכשיו לגוגל לבדוק את התחום שלך בזמן אמת 🔍\nתן לי בערך 15 שניות.";
export const RESEARCH_TRIGGER = "__research__"; // הודעת המשך אוטומטית מהדפדפן, לא מוצגת למשתמש

export const OPENING_MESSAGE = "היי 👋 אני העוזר הדיגיטלי של Mr.digitailor.\nתוך שתי דקות אני יכול להראות לך, במספרים אמיתיים מגוגל, כמה לקוחות והכנסות העסק שלך יכול להוציא מקמפיין חכם. שנבדוק?";
export const OPENING_REPLIES = ["יאללה, בוא נבדוק", "רגע, מי אתם בכלל?"];

/** קריאת מודל עם נסיונות חוזרים על עומס/תקלה זמנית — שיחת מכירה לא נופלת על 429 */
async function createWithRetry(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try { return await anthropic.messages.create(params); }
    catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status ?? 0;
      if (status === 429 || status >= 500 || status === 0) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function runChatTurn(chatId: string, userMessage: string): Promise<TurnResult> {
  const chat = await prisma.prospectChat.findUnique({ where: { id: chatId } });
  if (!chat) throw new Error("chat not found");

  const history = parse<StoredMessage[]>(chat.messages, []);
  let fields = parse<ChatFields>(chat.fields, {});
  const before = { reportReady: fields.reportStatus === "ready", email: Boolean(fields.email), meeting: Boolean(fields.meetingAt) };

  // שלב ב' של המחקר: הדפדפן שלח את הודעת ההמשך, עכשיו המחקר באמת רץ
  if (userMessage === RESEARCH_TRIGGER && fields.pendingResearch) {
    fields.pendingResearch = false;
    const { result, fields: nf } = await execTool(chatId, fields, "run_research", {});
    fields = nf;
    history.push({ role: "user", content: `[מערכת] תוצאות המחקר: ${result}. הצג עכשיו את הטיזר לפי הפורמט בתסריט והמשך משם. אם הסטטוס אינו ready, עבור למסלול no_data.`, at: new Date().toISOString() });
  } else {
    history.push({ role: "user", content: userMessage.slice(0, 1000), at: new Date().toISOString() });
  }

  // הקשר למודל: מה כבר ידוע (כדי שלא ישאל שוב אחרי רענון)
  const known = Object.entries(fields)
    .filter(([k, v]) => v !== undefined && k !== "slots")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
  const reportLine = fields.reportToken ? `\nקישור הדוח של המשתמש: ${APP_BASE}/report/${fields.reportToken}` : "";
  // רשימת המועדים נשארת זמינה לסוכן בין הודעות — ככה הוא זוכר מה המשתמש בחר גם אחרי שביקש טלפון
  const slotsLine = fields.slots?.length
    ? `\nהמועדים שהוצגו למשתמש (תווית ← startIso עבור book_meeting):\n${fields.slots.map((s) => `"${s.label}" ← ${s.startIso}`).join("\n")}`
    : "";
  // הידע של הסוכן: מה שבעל הפורטל הזין במסך "הידע של הסוכן" + תשובות לאסקלציות.
  // רק ידע של הפורטל שהשיחה שייכת אליו.
  const knowledgePortalId = chat.portalId
    ?? (await prisma.funnelPortal.findFirst({ where: { isDefault: true, deletedAt: null }, select: { id: true } }).catch(() => null))?.id
    ?? "";
  const learned = knowledgePortalId
    ? await prisma.portalKnowledge.findMany({
        where: { portalId: knowledgePortalId, deletedAt: null },
        orderBy: { updatedAt: "desc" }, take: 40,
      }).catch(() => [])
    : [];
  const learnedBlock = learned.length
    ? `\n\n## ידע של העסק (המקור המוסמך: השתמש בו כשנשאלת שאלה שהוא מכסה)\n${learned.map((e) => `נושא: ${e.title}\nמידע: ${e.content}`).join("\n---\n").slice(0, 8000)}`
    : "";
  const system = `${SYSTEM_PROMPT}${learnedBlock}\n\n## מצב נוכחי\nפרטים שכבר נאספו: ${known || "עדיין כלום"}${reportLine}${slotsLine}`;

  const msgs: Anthropic.MessageParam[] = [
    { role: "assistant", content: OPENING_MESSAGE },
    ...history.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
  ];

  let researching = false;
  let finalText = "";
  let provisionalText = ""; // טקסט שהגיע יחד עם קריאת כלים — רשת ביטחון

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await createWithRetry({
      model: AI_MODEL, max_tokens: 1000, system, messages: msgs, tools: TOOLS,
    });

    const textParts = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textJoined = textParts.join("\n").trim();
    console.log(`[ChatAgent] turn=${turn} stop=${res.stop_reason} tools=${toolUses.map((t) => t.name).join(",") || "none"} textLen=${textJoined.length}`);
    if (textJoined) provisionalText = textJoined;

    if (toolUses.length === 0) {
      finalText = textJoined;
      break;
    }

    // יירוט המחקר: קודם מבצעים שמירות פרטים שהגיעו באותה תשובה, ואז עוצרים ומכריזים.
    // המחקר עצמו ירוץ בתור ההמשך, כשהמשתמש כבר רואה את שורות ההתקדמות האמיתיות.
    const wantsResearch = toolUses.some((tu) => tu.name === "run_research");
    if (wantsResearch) {
      for (const tu of toolUses) {
        if (tu.name === "save_profile") {
          const { fields: nf } = await execTool(chatId, fields, tu.name, (tu.input ?? {}) as Record<string, unknown>);
          fields = nf;
        }
      }
      fields.pendingResearch = true;
      researching = true;
      finalText = RESEARCH_ANNOUNCEMENT;
      break;
    }

    msgs.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const { result, fields: nf } = await execTool(chatId, fields, tu.name, (tu.input ?? {}) as Record<string, unknown>);
      fields = nf;
      results.push({ type: "tool_result", tool_use_id: tu.id, content: result });
    }
    msgs.push({ role: "user", content: results });
  }

  // הסוכן סיים בלי הודעה? קודם כל: הטקסט שהוא כתב יחד עם קריאת הכלי הוא התשובה
  // (זה הדפוס הנפוץ: המודל כותב את ההודעה ומפעיל כלי באותה תשובה, ואז מסיים ריק)
  if (!finalText && provisionalText) {
    console.log("[ChatAgent] using provisional text that accompanied the tool call");
    finalText = provisionalText;
  }
  // עדיין כלום? מכריחים אותו לנסח תשובה, בלי כלים
  if (!finalText) {
    console.warn("[ChatAgent] empty final text, forcing text-only reply");
    try {
      const forced = await createWithRetry({
        model: AI_MODEL, max_tokens: 700, system,
        messages: [...msgs, { role: "user", content: "[מערכת] ענה עכשיו למשתמש בהודעת טקסט אחת לפי מצב השיחה. אל תשתמש בכלים." }],
        tools: TOOLS, tool_choice: { type: "none" },
      });
      finalText = forced.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    } catch { /* ניפול לרשתות הביטחון הבאות */ }
  }
  if (!finalText) finalText = "סליחה על ההמתנה! איבדתי את עצמי לרגע. איפה היינו?";
  finalText = finalText.replace(/[—–]/g, "-"); // ביטחון: בלי מקפים ארוכים

  const split = splitQuickReplies(finalText);
  const quickReplies = split.quickReplies;
  // הודעה שכולה כפתורים בלי טקסט נראית כמו תקלה — תמיד יש משפט מלווה
  const reply = split.reply || (quickReplies.length ? "בחרו אחת מהאפשרויות 👇" : split.reply);
  if (!split.reply && quickReplies.length) finalText = `${reply}\n[כפתורים: ${quickReplies.join(" | ")}]`;
  history.push({ role: "assistant", content: finalText, at: new Date().toISOString() });

  await prisma.prospectChat.update({
    where: { id: chatId },
    data: { messages: JSON.stringify(history.slice(-120)), fields: JSON.stringify(fields) },
  });

  const events: FunnelEvent[] = [];
  if (!before.reportReady && fields.reportStatus === "ready") events.push("funnel_numbers_shown");
  if (!before.email && fields.email) events.push("funnel_lead");
  if (!before.meeting && fields.meetingAt) events.push("funnel_meeting_booked");

  return { reply, quickReplies, researching, events };
}
