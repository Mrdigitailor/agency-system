// שאלון כניסה v2 — "מכונת פגישות מגוגל".
// קונפיג מלא של 24 השאלות (7 פרקים), sanitization גנרי לפי הקונפיג,
// ומיפוי התשובות לתעודת הזהות של הלקוח (ממלא רק שדות ריקים — לא דורס).
// הספק המאושר: https://claude.ai/code/artifact/b1464079-cdfb-4c4a-803d-b481460d6116
import { prisma } from "@/lib/db/prisma";
import { todayIL } from "@/lib/utils/ildate";

// ---------- טיפוסי קונפיג ----------
export type FieldType = "text" | "url" | "textarea" | "select";
export interface Field {
  key: string;
  label?: string;
  placeholder?: string;
  type: FieldType;
  options?: string[]; // ל-select
  optional?: boolean;
  max?: number; // אורך מקסימלי
}
export type QuestionInput =
  | { kind: "fields"; fields: Field[] }
  | { kind: "repeater"; itemLabel: string; addLabel: string; fields: Field[]; maxRows?: number }
  | { kind: "choice"; options: string[]; detail?: { showFor: string[]; field: Field } }
  | { kind: "upload"; accept: string; maxFiles?: number; hint?: string; extraFields?: Field[] };

export interface Question {
  id: string;
  chapter: number;
  title: string;
  why: string;      // "למה אנחנו שואלים" — מנוסח ללקוח
  example?: string; // דוגמה לתשובה טובה
  input: QuestionInput;
  optional?: boolean; // מציג כפתור "דלג"
}
export interface Chapter { num: number; title: string; sub?: string; milestone?: string }

// ---------- הפרקים ----------
export const CHAPTERS: Chapter[] = [
  { num: 1, title: "היכרות מהירה", sub: "ארבע שאלות קלות בשביל לצבור תאוצה" },
  { num: 2, title: "הסיפור שלך", milestone: "🎯 4 שאלות מאחוריך — עכשיו החלק שהכי כיף לספר" },
  { num: 3, title: "המוצרים וההצעה" },
  { num: 4, title: "הלקוחות שלך", milestone: "🔥 חצית את חצי הדרך! הפרק הזה הוא הסוד של קופי שמוכר" },
  { num: 5, title: "הוכחות ומתחרים" },
  { num: 6, title: "שיחות המכירה שלך", milestone: "💪 עוד 7 וסיימנו — והשאלה הבאה שווה הכי הרבה כסף" },
  { num: 7, title: "תפעול וטכני", sub: "שאלות קצרות וסגורות — בלי חשיבה, רק עובדות" },
];

// ---------- השאלות ----------
export const QUESTIONS: Question[] = [
  // פרק 1 — היכרות מהירה
  {
    id: "q01", chapter: 1, title: "מה השם המלא של העסק?",
    why: "ככה שהוא מופיע ללקוחות — במודעות, בדף ובמיילים נשתמש בדיוק בשם הזה.",
    input: { kind: "fields", fields: [{ key: "name", type: "text", placeholder: "שם העסק", max: 200 }] },
  },
  {
    id: "q02", chapter: 1, title: "קישורים לרשתות החברתיות שלך",
    why: "אנחנו לומדים מהן את השפה הוויזואלית שלך ואת מה שכבר עובד לך בתוכן.",
    input: { kind: "fields", fields: [
      { key: "instagram", label: "אינסטגרם", type: "url", optional: true, placeholder: "https://instagram.com/..." },
      { key: "facebook", label: "פייסבוק", type: "url", optional: true, placeholder: "https://facebook.com/..." },
      { key: "tiktok", label: "טיקטוק", type: "url", optional: true, placeholder: "https://tiktok.com/@..." },
      { key: "linkedin", label: "לינקדאין", type: "url", optional: true, placeholder: "https://linkedin.com/..." },
      { key: "other", label: "אחר", type: "url", optional: true, placeholder: "יוטיוב / כל רשת אחרת" },
    ] },
    optional: true,
  },
  {
    id: "q03", chapter: 1, title: "קישורים לנכסים דיגיטליים — אתר, דפי נחיתה קיימים",
    why: "נסרוק אותם כדי לראות מה כבר קיים, מה עובד ומה כדאי לשמר בדף החדש.",
    example: "mysite.co.il — האתר הראשי (ישן, לא מעודכן) · lp.mysite.co.il/sale — דף מקמפיין קודם שהביא תוצאות טובות",
    input: { kind: "repeater", itemLabel: "נכס", addLabel: "+ הוסף נכס", maxRows: 10, fields: [
      { key: "url", label: "קישור", type: "url", placeholder: "https://..." },
      { key: "note", label: "הערה", type: "text", optional: true, placeholder: "מה זה ומה מצבו?", max: 300 },
    ] },
    optional: true,
  },
  {
    id: "q04", chapter: 1, title: "יש לך כרטיס עסק בגוגל (Google Business Profile)?",
    why: "כרטיס עסק עם ביקורות טובות מחזק את הקמפיין בגוגל ומוריד את מחיר הקליק. אם אין — נמליץ להקים.",
    input: { kind: "choice", options: ["כן", "לא", "לא בטוח"], detail: { showFor: ["כן"], field: { key: "url", label: "קישור לכרטיס", type: "url", optional: true, placeholder: "https://g.page/..." } } },
  },

  // פרק 2 — הסיפור שלך
  {
    id: "q05", chapter: 2, title: "ספר לנו על העסק — מה אתם עושים, למה הקמת אותו, ומה החלום?",
    why: "אנשים קונים מאנשים. הסיפור שלך הופך לחלק מהדף ומהמיילים — והוא מה שמבדיל אותך מעוד ספק אנונימי.",
    example: "\"אני מלווה משפחות בתכנון משכנתא כבר 9 שנים. הקמתי את העסק אחרי שראיתי את ההורים שלי חותמים על משכנתא גרועה בגלל שאף אחד לא הסביר להם. החלום — שאף משפחה לא תחתום על מסמך שהיא לא מבינה.\"",
    input: { kind: "fields", fields: [{ key: "story", type: "textarea", placeholder: "ספר בחופשיות — ככל שתפרט יותר, הדף יהיה מדויק יותר", max: 5000 }] },
  },
  {
    id: "q06", chapter: 2, title: "כמה זמן העסק קיים, וכמה לקוחות שירתת עד היום (בערך)?",
    why: "\"ליווינו 340 משפחות ב-9 שנים\" זה משפט שמוכר. מספרים אמיתיים, גם מעוגלים, שווים יותר מכל תיאור.",
    input: { kind: "fields", fields: [
      { key: "years", label: "כמה זמן העסק קיים?", type: "text", placeholder: "למשל: 9 שנים", max: 100 },
      { key: "clientsServed", label: "כמה לקוחות בערך?", type: "text", placeholder: "למשל: ~340", max: 100 },
    ] },
  },

  // פרק 3 — המוצרים וההצעה
  {
    id: "q07", chapter: 3, title: "מה המוצרים או השירותים שלך?",
    why: "שולי הרווח וזמן האספקה קובעים איזה מוצר הכי משתלם לקדם — לפעמים זה לא המוצר שנראה מתבקש.",
    example: "ליווי משכנתא מלא · 6,500 ₪ · רווח ~70% · 6–8 שבועות · אחרי הליווי רוב הלקוחות חוזרים למחזור בעוד כמה שנים",
    input: { kind: "repeater", itemLabel: "מוצר", addLabel: "+ הוסף מוצר", maxRows: 10, fields: [
      { key: "name", label: "שם המוצר/שירות", type: "text", max: 200 },
      { key: "description", label: "תיאור קצר", type: "text", optional: true, max: 500 },
      { key: "price", label: "מחיר", type: "text", optional: true, placeholder: "למשל: 6,500 ₪", max: 100 },
      { key: "margin", label: "שולי רווח אחרי הוצאות", type: "text", optional: true, placeholder: "למשל: ~70%", max: 100 },
      { key: "delivery", label: "זמן אספקה", type: "text", optional: true, placeholder: "למשל: 6–8 שבועות", max: 100 },
      { key: "followUp", label: "יש המשך שירות אחרי?", type: "text", optional: true, max: 300 },
    ] },
  },
  {
    id: "q08", chapter: 3, title: "איזה מוצר אחד היית רוצה שנקדם ראשון — ולמה?",
    why: "קמפיין שמקדם דבר אחד מנצח קמפיין שמקדם חמישה. מתחילים ממוקד, מרחיבים אחר כך.",
    input: { kind: "fields", fields: [
      { key: "product", label: "המוצר", type: "text", placeholder: "מהמוצרים שציינת למעלה", max: 200 },
      { key: "reason", label: "למה דווקא הוא?", type: "text", optional: true, max: 500 },
    ] },
  },
  {
    id: "q09", chapter: 3, title: "מה נציע לגולש בדף כצעד ראשון?",
    why: "זו הקריאה לפעולה של כל הדף. חייבת להיות הצעה שאתה שלם איתה ויכול לעמוד בה.",
    input: { kind: "choice", options: ["שיחת ייעוץ חינם", "פגישת היכרות", "בדיקת התאמה", "הצעת מחיר", "אחר"], detail: { showFor: ["אחר"], field: { key: "otherOffer", label: "פרט", type: "text", max: 300 } } },
  },
  {
    id: "q10", chapter: 3, title: "להציג מחירים בדף?",
    why: "מחיר גלוי מסנן פניות לא רציניות אבל מקטין את הכמות. אין תשובה נכונה — יש העדפה שלך, ואנחנו נתאים.",
    input: { kind: "choice", options: ["כן", "לא", "רק \"החל מ־\""] },
  },

  // פרק 4 — הלקוחות שלך
  {
    id: "q11", chapter: 4, title: "באיזה רגע הלקוח שלך פותח את גוגל ומחפש? מה קרה לו יום קודם?",
    why: "זו השאלה הכי חשובה בשאלון. אנחנו כותבים את הדף לרגע החיפוש — לא לתיאור העסק.",
    example: "\"קיבל אישור עקרוני מהבנק ונבהל מהמספרים. או שחבר סיפר לו שחסך 200 אלף עם יועץ, ועכשיו הוא מחפש 'יועץ משכנתאות מומלץ'.\"",
    input: { kind: "fields", fields: [{ key: "trigger", type: "textarea", max: 3000 }] },
  },
  {
    id: "q12", chapter: 4, title: "מה התוצאה שהלקוח מקבל — במספרים אם אפשר — וכמה זמן עד שהוא רואה אותה?",
    why: "כותרת עם מספר ספציפי (\"חיסכון ממוצע של 180,000 ₪\") מנצחת כל הבטחה כללית (\"החיסכון הטוב ביותר\").",
    input: { kind: "fields", fields: [{ key: "results", type: "textarea", max: 3000 }] },
  },
  {
    id: "q13", chapter: 4, title: "מה לקוחות אמרו לך שגרם להם לבחור דווקא בך?",
    why: "שים לב — לא למה אתה חושב שאתה טוב, אלא מה הם אמרו. ההבדל בין השניים הוא בדרך כלל הבידול האמיתי שלך.",
    example: "\"כמה לקוחות אמרו שבחרו בי כי עניתי להם בוואטסאפ תוך שעה גם בערב, והרגישו שיש עם מי לדבר.\"",
    input: { kind: "fields", fields: [{ key: "whyChose", type: "textarea", max: 3000 }] },
  },
  {
    id: "q14", chapter: 4, title: "כשמתקשר אליך מתעניין חדש — מה אתה שואל אותו כדי להבין אם הוא מתאים?",
    why: "הסוכן החכם בדף שלך הולך לנהל את הבירור הזה בשבילך — והוא צריך ללמוד לעשות את זה בדיוק כמוך.",
    example: "1. באיזה שלב אתם — לפני אישור עקרוני או אחרי? 2. מה גובה המשכנתא בערך? 3. מתי אתם רוצים להיכנס לדירה?",
    input: { kind: "fields", fields: [{ key: "qualifying", type: "textarea", placeholder: "רשום את השאלות, אחת בכל שורה", max: 3000 }] },
  },
  {
    id: "q15", chapter: 4, title: "איזה פניות אתה מעדיף שלא יגיעו אליך בכלל?",
    why: "כדי שהסוכן ידע לסנן בעדינות את מי שמבזבז לך זמן — לפני שהוא מגיע ליומן שלך.",
    example: "\"אנשים שמחפשים רק להשוות מחירים, או משכנתאות מתחת ל-500 אלף — שם אין לי איך לייצר ערך שמצדיק את העלות.\"",
    input: { kind: "fields", fields: [{ key: "disqualify", type: "textarea", max: 3000 }] },
  },

  // פרק 5 — הוכחות ומתחרים
  {
    id: "q16", chapter: 5, title: "יש לך המלצות מלקוחות? איפה אפשר לראות אותן?",
    why: "המלצה אמיתית אחת שווה עשרה משפטי שיווק. סרטונים הם זהב — הם נכנסים לדף ולרצף המיילים.",
    input: { kind: "repeater", itemLabel: "המלצה", addLabel: "+ הוסף המלצה", maxRows: 15, fields: [
      { key: "url", label: "קישור", type: "url", placeholder: "https://..." },
      { key: "type", label: "סוג", type: "select", options: ["סרטון", "טקסט", "ביקורת גוגל", "צילום מסך", "אחר"] },
    ] },
    optional: true,
  },
  {
    id: "q17", chapter: 5, title: "מי המתחרים שלך?",
    why: "אנחנו בודקים מה הם מציעים ואיך הם מפרסמים — כדי שהדף שלך יגיד משהו שהם לא אומרים.",
    input: { kind: "repeater", itemLabel: "מתחרה", addLabel: "+ הוסף מתחרה", maxRows: 5, fields: [
      { key: "name", label: "שם", type: "text", max: 200 },
      { key: "website", label: "אתר", type: "url", optional: true },
      { key: "social", label: "רשת חברתית", type: "url", optional: true },
    ] },
    optional: true,
  },

  // פרק 6 — שיחות המכירה
  {
    id: "q18", chapter: 6, title: "מה השאלות וההתנגדויות שעולות בכל שיחת מכירה — ומה אתה עונה עליהן?",
    why: "התשובות שלך מזינות שלושה דברים בבת אחת: את הסוכן בדף, את סקשן השאלות בדף עצמו, ואת רצף המיילים. זו השאלה שהכי משתלם להשקיע בה.",
    example: "\"זה יקר לי\" ← אני מראה שהחיסכון הממוצע גדול פי 20 מהעלות. \"אני אסתדר מול הבנק לבד\" ← אני שואל אם הם יודעים מה ההפרש בין המסלולים שהבנק הציע, ורובם מגלים שלא.",
    input: { kind: "repeater", itemLabel: "התנגדות", addLabel: "+ הוסף התנגדות", maxRows: 20, fields: [
      { key: "objection", label: "השאלה / ההתנגדות", type: "text", max: 500 },
      { key: "answer", label: "התשובה שלך היום", type: "textarea", max: 2000 },
    ] },
  },

  // פרק 7 — תפעול וטכני
  {
    id: "q19", chapter: 7, title: "איפה אתה נותן שירות?",
    why: "קובע לאיזה אזורים הקמפיין יפנה — בגוגל זה ההבדל בין תקציב מדויק לתקציב מבוזבז.",
    input: { kind: "choice", options: ["כל הארץ", "אזורים מסוימים", "גם אונליין — בלי תלות במיקום"], detail: { showFor: ["אזורים מסוימים"], field: { key: "areas", label: "אילו אזורים?", type: "text", placeholder: "למשל: גוש דן והשרון", max: 300 } } },
  },
  {
    id: "q20", chapter: 7, title: "איזה יומן אתה מנהל, ומתי אתה זמין לפגישות עם מתעניינים?",
    why: "מתעניינים הולכים לקבוע פגישות אצלך ביומן ישירות מהדף — אנחנו רק צריכים לדעת מתי מותר להם.",
    input: { kind: "fields", fields: [
      { key: "calendar", label: "איזה יומן?", type: "select", options: ["יומן גוגל", "Outlook", "אחר", "אין לי יומן מסודר"] },
      { key: "hours", label: "ימים ושעות לפגישות", type: "text", placeholder: "למשל: א'-ה' 9:00–17:00", max: 200 },
      { key: "meetingLength", label: "אורך פגישה", type: "select", options: ["15 דקות", "30 דקות", "45 דקות", "שעה"] },
      { key: "buffer", label: "מרווח בין פגישות", type: "select", options: ["בלי מרווח", "15 דקות", "30 דקות"] },
    ] },
  },
  {
    id: "q21", chapter: 7, title: "מי עונה לפניות חדשות, ותוך כמה זמן בדרך כלל?",
    why: "פנייה שנענית תוך שעה שווה פי כמה מפנייה שנענית מחר. נבנה את ההתראות סביב איך שאתה באמת עובד.",
    input: { kind: "fields", fields: [
      { key: "who", label: "מי עונה?", type: "select", options: ["אני", "איש צוות", "מזכירה", "משתנה"] },
      { key: "speed", label: "תוך כמה זמן?", type: "select", options: ["תוך שעה", "באותו יום", "יום-יומיים", "כשמתפנה"] },
      { key: "channel", label: "ערוץ מועדף", type: "select", options: ["טלפון", "וואטסאפ", "מייל"] },
    ] },
  },
  {
    id: "q22", chapter: 7, title: "יש לך חשבון גוגל אדס? הוגדר בו אמצעי תשלום?",
    why: "החשבון נשאר בבעלותך ואתה משלם לגוגל ישירות — כך אתה תמיד בשליטה. אם אין חשבון, נקים יחד ב-10 דקות.",
    input: { kind: "choice", options: ["יש חשבון עם אמצעי תשלום", "יש חשבון בלי אמצעי תשלום", "אין חשבון", "לא יודע"] },
  },
  {
    id: "q23", chapter: 7, title: "מי מנהל לך את הדומיין של האתר?",
    why: "דף הנחיתה יעלה על כתובת משלך (למשל go.העסק-שלך.co.il), והמיילים יישלחו מהדומיין שלך — לשניהם צריך גישה קצרה וחד-פעמית.",
    input: { kind: "choice", options: ["אני יודע לגשת", "יש איש טכני", "לא יודע"], detail: { showFor: ["יש איש טכני"], field: { key: "techContact", label: "פרטי קשר של איש הטכני", type: "text", max: 300 } } },
  },
  {
    id: "q24", chapter: 7, title: "נכסי המותג — לוגו, פונטים, ספר מותג",
    why: "הדף שלך ייבנה בשפה הוויזואלית של המותג שלך — לוגו, צבעים ופונטים. מה שתעלה כאן נכנס ישירות לעיצוב.",
    input: { kind: "upload",
      accept: "image/*,.pdf,.woff,.woff2,.ttf,.otf",
      maxFiles: 10,
      hint: "לוגו (רצוי בכמה גרסאות), ספר מותג אם יש, קבצי פונט",
      extraFields: [
        { key: "colors", label: "צבעי המותג", type: "text", optional: true, placeholder: "קודים אם ידועים (#eed89b) או תיאור — \"זהב ושחור\"", max: 300 },
        { key: "fontsNote", label: "שמות הפונטים (אם אין קבצים)", type: "text", optional: true, max: 200 },
      ],
    },
    optional: true,
  },
  {
    id: "q25", chapter: 7, title: "תמונות וסרטונים — שלך, של הצוות, של העבודות",
    why: "תמונות אמיתיות שלך מנצחות כל תמונת מאגר. וגם \"אין לי כלום\" זו תשובה מצוינת — יש לנו פתרון מעוצב בדיוק למקרה הזה.",
    input: { kind: "upload",
      accept: "image/*,video/*",
      maxFiles: 15,
      hint: "תמונות שלך, של הצוות, של עבודות · סרטוני תדמית והמלצות",
      extraFields: [
        { key: "folderUrl", label: "יש הרבה קבצים? הדבק קישור לתיקייה", type: "url", optional: true, placeholder: "https://drive.google.com/..." },
      ],
    },
    optional: true,
  },
];

// ---------- טיפוסי תשובות ----------
// fields → Record<key,string> · repeater → Array<Record<key,string>> · choice → { choice, detail? }
// upload → { files: [{url,name}], fields? }
export interface UploadedFile { url: string; name: string }
export type AnswerValue =
  | Record<string, string>
  | Array<Record<string, string>>
  | { choice: string; detail?: string }
  | { files: UploadedFile[]; fields?: Record<string, string> };
export interface AnswersV2 {
  step: number; // המסך האחרון שהוצג — להמשך מאותה נקודה
  data: Record<string, AnswerValue>;
  confirm?: { dealValue: string; budget: string; note: string }; // מסך "מה שכבר סיפרת לנו"
}

export const EMPTY_V2: AnswersV2 = { step: 0, data: {} };

export function parseAnswersV2(raw: string): AnswersV2 {
  try {
    const p = JSON.parse(raw || "{}");
    if (p && typeof p === "object" && "data" in p) return { ...EMPTY_V2, ...p, data: p.data ?? {} };
    return { ...EMPTY_V2 };
  } catch { return { ...EMPTY_V2 }; }
}

// ---------- sanitization גנרי לפי הקונפיג ----------
const str = (v: unknown, max = 4000) => String(v ?? "").slice(0, max);

function sanitizeFieldVal(f: Field, v: unknown): string {
  const s = str(v, f.max ?? (f.type === "textarea" ? 5000 : 500)).trim();
  if (f.type === "select" && f.options && s && !f.options.includes(s)) return "";
  return s;
}

export function sanitizeAnswersV2(body: unknown): AnswersV2 {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawData = (b.data ?? {}) as Record<string, unknown>;
  const data: Record<string, AnswerValue> = {};

  for (const q of QUESTIONS) {
    const v = rawData[q.id];
    if (v == null) continue;
    if (q.input.kind === "fields") {
      const row = (v ?? {}) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const f of q.input.fields) out[f.key] = sanitizeFieldVal(f, row[f.key]);
      if (Object.values(out).some(Boolean)) data[q.id] = out;
    } else if (q.input.kind === "repeater") {
      const { fields, maxRows } = q.input;
      const rows = Array.isArray(v) ? v.slice(0, maxRows ?? 20) : [];
      const out = rows.map((r) => {
        const row = (r ?? {}) as Record<string, unknown>;
        const o: Record<string, string> = {};
        for (const f of fields) o[f.key] = sanitizeFieldVal(f, row[f.key]);
        return o;
      }).filter((r) => Object.values(r).some(Boolean));
      if (out.length) data[q.id] = out;
    } else if (q.input.kind === "upload") {
      const row = (v ?? {}) as Record<string, unknown>;
      const rawFiles = Array.isArray(row.files) ? row.files.slice(0, q.input.maxFiles ?? 15) : [];
      const files = rawFiles.map((f) => {
        const r = (f ?? {}) as Record<string, unknown>;
        const url = str(r.url, 600);
        // רק קבצים מהאחסון שלנו, בתיקיית onboarding
        try {
          const u = new URL(url);
          if (!u.hostname.endsWith(".vercel-storage.com") || !u.pathname.replace(/^\//, "").startsWith("onboarding/")) return null;
        } catch { return null; }
        return { url, name: str(r.name, 200) || "קובץ" };
      }).filter((f): f is { url: string; name: string } => f !== null);
      const extra: Record<string, string> = {};
      const rowFields = (row.fields ?? {}) as Record<string, unknown>;
      for (const f of q.input.extraFields ?? []) extra[f.key] = sanitizeFieldVal(f, rowFields[f.key]);
      if (files.length || Object.values(extra).some(Boolean)) data[q.id] = { files, fields: extra };
    } else {
      const row = (v ?? {}) as Record<string, unknown>;
      const choice = str(row.choice, 100);
      if (q.input.options.includes(choice)) {
        data[q.id] = { choice, detail: str(row.detail, q.input.detail?.field.max ?? 500) };
      }
    }
  }

  const rawConfirm = (b.confirm ?? null) as Record<string, unknown> | null;
  return {
    step: Math.max(0, Math.min(Number(b.step) || 0, QUESTIONS.length + 1)),
    data,
    ...(rawConfirm ? { confirm: { dealValue: str(rawConfirm.dealValue, 100), budget: str(rawConfirm.budget, 100), note: str(rawConfirm.note, 1000) } } : {}),
  };
}

// ---------- עזרים לקריאת תשובות ----------
const fieldsOf = (a: AnswersV2, id: string): Record<string, string> => {
  const v = a.data[id];
  return v && !Array.isArray(v) && !("choice" in v) ? (v as Record<string, string>) : {};
};
const rowsOf = (a: AnswersV2, id: string): Array<Record<string, string>> => Array.isArray(a.data[id]) ? (a.data[id] as Array<Record<string, string>>) : [];
const choiceOf = (a: AnswersV2, id: string): { choice: string; detail?: string } => {
  const v = a.data[id];
  return v && !Array.isArray(v) && "choice" in v ? (v as { choice: string; detail?: string }) : { choice: "" };
};
const uploadOf = (a: AnswersV2, id: string): { files: UploadedFile[]; fields: Record<string, string> } => {
  const v = a.data[id];
  if (v && !Array.isArray(v) && "files" in v) {
    const u = v as { files: UploadedFile[]; fields?: Record<string, string> };
    return { files: u.files ?? [], fields: u.fields ?? {} };
  }
  return { files: [], fields: {} };
};

function isEmptyJsonArray(value: string): boolean {
  try { return (JSON.parse(value || "[]") as unknown[]).length === 0; } catch { return true; }
}

// ---------- מיפוי לתעודת הזהות (רק שדות ריקים) ----------
export async function applyV2ToProfile(clientId: string, a: AnswersV2): Promise<string[]> {
  let profile = await prisma.clientProfile.findUnique({ where: { clientId } });
  if (!profile) profile = await prisma.clientProfile.create({ data: { clientId } });

  const data: Record<string, string> = {};
  const setIfEmpty = (key: keyof typeof profile, val: string) => {
    if (val.trim() && !String(profile[key] ?? "").trim()) data[key as string] = val.trim();
  };

  setIfEmpty("businessDescription", fieldsOf(a, "q05").story ?? "");
  setIfEmpty("whyChooseUs", fieldsOf(a, "q13").whyChose ?? "");

  // אזור שירות
  const area = choiceOf(a, "q19");
  if (area.choice) {
    setIfEmpty("serviceArea", area.choice === "כל הארץ" ? "national" : area.choice === "אזורים מסוימים" ? "local" : "international");
    setIfEmpty("serviceAreaDetails", area.detail ?? "");
  }

  // מוצרים
  const products = rowsOf(a, "q07").filter((p) => p.name?.trim());
  if (products.length && isEmptyJsonArray(profile.products)) {
    data.products = JSON.stringify(products.map((p) => ({
      name: p.name, description: p.description ?? "", priceRange: p.price ?? "",
      pricingModel: p.margin ? `רווח: ${p.margin}` : "", seasonality: "",
      promotions: [p.delivery && `אספקה: ${p.delivery}`, p.followUp && `המשך: ${p.followUp}`].filter(Boolean).join(" · "),
    })));
  }

  // מתחרים
  const competitors = rowsOf(a, "q17").filter((c) => c.name?.trim());
  if (competitors.length && isEmptyJsonArray(profile.competitors)) {
    data.competitors = JSON.stringify(competitors.map((c) => ({
      name: c.name, website: c.website ?? "", facebook: c.social ?? "", instagram: "", adLibrary: "",
      strengths: "", weaknesses: "", notes: "מתוך שאלון הכניסה",
    })));
  }

  // התנגדויות — זוגות שאלה←תשובה
  const objections = rowsOf(a, "q18").filter((o) => o.objection?.trim());
  if (objections.length) {
    setIfEmpty("objections", objections.map((o) => `${o.objection} ← ${o.answer ?? ""}`).join("\n"));
  }

  // הוכחות חברתיות — קישורי המלצות
  const testimonials = rowsOf(a, "q16").filter((t) => t.url?.trim());
  if (testimonials.length) {
    setIfEmpty("socialProof", testimonials.map((t) => `${t.type ?? "המלצה"}: ${t.url}`).join("\n"));
  }

  // נכסי מותג — לוגו, צבעים, תיקיית נכסים
  const brand = uploadOf(a, "q24");
  const media = uploadOf(a, "q25");
  const firstImage = brand.files.find((f) => /\.(png|jpe?g|webp|svg|gif)(\?|$)/i.test(f.url) || /\.(png|jpe?g|webp|svg|gif)$/i.test(f.name));
  if (firstImage) setIfEmpty("logoUrl", firstImage.url);
  // חילוץ קודי צבע אם הוזנו
  const hexes = (brand.fields.colors ?? "").match(/#[0-9a-fA-F]{3,8}/g) ?? [];
  if (hexes.length && isEmptyJsonArray(profile.brandColors)) data.brandColors = JSON.stringify(hexes);
  setIfEmpty("assetBankUrl", media.fields.folderUrl ?? "");

  // כל מה שאין לו שדה ייעודי — הערה פנימית מסודרת אחת
  const noteParts: string[] = [];
  const push = (label: string, val?: string) => { if (val?.trim()) noteParts.push(`${label}: ${val.trim()}`); };
  const socials = fieldsOf(a, "q02");
  const socialLine = Object.entries(socials).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
  push("🔗 רשתות חברתיות", socialLine);
  push("🌐 נכסים דיגיטליים", rowsOf(a, "q03").map((r) => [r.url, r.note].filter(Boolean).join(" — ")).join("\n"));
  const gbp = choiceOf(a, "q04");
  push("📍 כרטיס עסק בגוגל", [gbp.choice, gbp.detail].filter(Boolean).join(" · "));
  const nums = fieldsOf(a, "q06");
  push("📅 ותק ולקוחות", [nums.years, nums.clientsServed && `~${nums.clientsServed} לקוחות`].filter(Boolean).join(" · "));
  const promote = fieldsOf(a, "q08");
  push("🎯 מוצר לקידום ראשון", [promote.product, promote.reason].filter(Boolean).join(" — "));
  const offer = choiceOf(a, "q09");
  push("🎁 ההצעה בדף", [offer.choice, offer.detail].filter(Boolean).join(": "));
  push("💰 הצגת מחירים בדף", choiceOf(a, "q10").choice);
  push("⚡ הטריגר לחיפוש", fieldsOf(a, "q11").trigger);
  push("📈 התוצאה ללקוח", fieldsOf(a, "q12").results);
  push("❓ שאלות הסינון שלו", fieldsOf(a, "q14").qualifying);
  push("🚫 פניות לא רצויות", fieldsOf(a, "q15").disqualify);
  const cal = fieldsOf(a, "q20");
  push("🗓️ יומן ופגישות", [cal.calendar, cal.hours, cal.meetingLength && `פגישה: ${cal.meetingLength}`, cal.buffer && `מרווח: ${cal.buffer}`].filter(Boolean).join(" · "));
  const resp = fieldsOf(a, "q21");
  push("📞 מענה לפניות", [resp.who, resp.speed, resp.channel].filter(Boolean).join(" · "));
  push("💳 חשבון גוגל אדס", choiceOf(a, "q22").choice);
  const dom = choiceOf(a, "q23");
  push("🔧 ניהול דומיין", [dom.choice, dom.detail].filter(Boolean).join(" · "));
  const fileList = (files: UploadedFile[]) => files.map((f) => `${f.name} — ${f.url}`).join("\n");
  push("🎨 נכסי מותג שהועלו", fileList(brand.files));
  if (!hexes.length) push("🎨 צבעי המותג (בתיאור)", brand.fields.colors);
  push("🔤 פונטים", brand.fields.fontsNote);
  push("🖼️ תמונות וסרטונים שהועלו", fileList(media.files));
  if (a.confirm) push("✅ אישור נתוני מכירה", [a.confirm.dealValue && `עסקה: ${a.confirm.dealValue}`, a.confirm.budget && `תקציב: ${a.confirm.budget}`, a.confirm.note].filter(Boolean).join(" · "));

  if (noteParts.length) {
    let notes: Array<{ content: string; date: string; author: string }> = [];
    try { notes = JSON.parse(profile.internalNotes || "[]"); } catch {}
    notes.unshift({ content: `תשובות שאלון הכניסה (מכונת פגישות):\n\n${noteParts.join("\n\n")}`, date: todayIL(), author: "שאלון לקוח" });
    data.internalNotes = JSON.stringify(notes);
  }

  if (Object.keys(data).length) {
    await prisma.clientProfile.update({ where: { clientId }, data });
  }
  return Object.keys(data);
}

// ---------- חילוץ נכסים לתצוגה בכרטיס הלקוח ----------
export interface OnboardingAssets {
  brandFiles: UploadedFile[]; // לוגו, ספר מותג, פונטים (q24)
  mediaFiles: UploadedFile[]; // תמונות וסרטונים (q25)
  colors: string;             // צבעי המותג כפי שנכתבו
  fontsNote: string;
  folderUrl: string;          // קישור לתיקייה חיצונית
}

export function extractAssets(a: AnswersV2): OnboardingAssets {
  const brand = uploadOf(a, "q24");
  const media = uploadOf(a, "q25");
  return {
    brandFiles: brand.files,
    mediaFiles: media.files,
    colors: brand.fields.colors ?? "",
    fontsNote: brand.fields.fontsNote ?? "",
    folderUrl: media.fields.folderUrl ?? "",
  };
}
