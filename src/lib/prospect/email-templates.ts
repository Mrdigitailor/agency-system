// רצף הדיוור כנתונים: לכל מייל יש תפקיד אחד, מבנה קבוע, ונוסח שאפשר לערוך.
// המבנה (קופסת המספרים, כפתור, חתימה) קבוע בקוד כדי שהמיילים יישארו נקיים ואחידים.
// הנוסח (נושא, כותרת משנית, טקסטים, טקסט הכפתור) נערך בטאב הדיוור ונשמר כגרסאות.
// הקובץ הזה טהור: בלי גישה לבסיס הנתונים, כדי שגם הדמו והתצוגה המקדימה ישתמשו בו.

export type EmailKey = "report" | "nurture1" | "nurture3" | "nurture7" | "reminder" | "reminder1h" | "cancelled";

/** השדות שבעל הפורטל עורך */
export interface EmailFields {
  subject: string;
  preheader: string;   // הכותרת המשנית: השורה שמופיעה ליד הנושא בתיבת הדואר
  bodyBefore: string;  // פסקאות הפתיחה. שורה ריקה = פסקה חדשה
  bodyAfter: string;   // פסקאות אחרי הקופסה הקבועה (אם יש), לפני הכפתור
  buttonLabel: string;
  footnote: string;    // שורת סיום קטנה אחרי הכפתור
}
export const EMAIL_FIELD_KEYS = ["subject", "preheader", "bodyBefore", "bodyAfter", "buttonLabel", "footnote"] as const;
export type EmailFieldKey = typeof EMAIL_FIELD_KEYS[number];
export const EMAIL_FIELD_LIMITS: Record<EmailFieldKey, number> = {
  subject: 150, preheader: 200, bodyBefore: 3000, bodyAfter: 3000, buttonLabel: 60, footnote: 400,
};

export interface EmailSpec {
  key: EmailKey;
  label: string;
  when: string;                          // מתי נשלח
  job: string;                           // התפקיד של המייל: השאלה שהוא סוגר אצל הליד
  block: "teaser" | "meeting" | "none";  // הקופסה הקבועה שבאמצע
  button: "report" | "start" | "zoom";   // לאן הכפתור מוביל
  marketing: boolean;                    // מייל המשך שיווקי: כולל קישור הסרה ולא נשלח למי שהוסר
  tokens: string[];                      // משתנים שמותר להשתמש בהם בנוסח
  defaults: EmailFields;
}

export const EMAIL_SPECS: EmailSpec[] = [
  {
    key: "report", label: "מייל הדוח", when: "מיד כשהליד משאיר מייל",
    job: "לאשר לליד שהגיע למקום רציני ולתת לו ערך מיידי: הדוח שהובטח לו בשיחה.",
    block: "teaser", button: "report", marketing: false, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "{שם}, דוח הפוטנציאל שלך מוכן",
      preheader: "הביקוש בגוגל, המחירים האמיתיים, וכל שלב בחישוב",
      bodyBefore: "היי {שם},\n\nכמו שהבטחתי בשיחה, הנה הדוח המלא על {תחום}: הביקוש בגוגל, המחירים האמיתיים, וכל שלב בחישוב.",
      bodyAfter: "",
      buttonLabel: "לצפייה בדוח המלא",
      footnote: "הדוח שמור אצלנו על השם שלך, אפשר לחזור אליו מתי שרוצים.",
    },
  },
  {
    key: "nurture1", label: "מעקב יום 1", when: "יום אחרי הדוח, למי שלא קבע פגישה",
    job: "לוודא שהדוח נקרא, ולהראות שיש אדם שמוכן להסביר את המספרים. מקרב לפגישה בלי לחץ.",
    block: "teaser", button: "start", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "{שם}, הספקת לעבור על המספרים?",
      preheader: "רציתי לוודא שהדוח הגיע אליך",
      bodyBefore: "היי {שם},\n\nאתמול הכנו לך דוח פוטנציאל על העסק. רציתי לוודא שהוא הגיע ושהספקת להציץ.",
      bodyAfter: "אם משהו במספרים לא ברור, או שאתה רוצה להבין איך מגיעים אליהם בפועל, בפגישת זום קצרה של 30 דקות עם סער עוברים על הכל יחד: הניתוח, המתחרים שלך בשידור חי, והצעדים. בלי עלות ובלי מחויבות.",
      buttonLabel: "לקביעת פגישה",
      footnote: "ואם עכשיו לא הזמן, הכל טוב. הדוח נשאר שלך.",
    },
  },
  {
    key: "nurture3", label: "מעקב יום 3", when: "שלושה ימים אחרי הדוח, למי שלא קבע פגישה",
    job: "להראות מומחיות: לתת לליד תובנה שמשנה איך הוא שופט ספקים, כולל את המתחרים שלנו.",
    block: "none", button: "start", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "למה לידים לבד לא מספיקים",
      preheader: "ההבדל בין קמפיין שמרוויח לקמפיין ששורף כסף",
      bodyBefore: "היי {שם},\n\nמשהו שלמדנו אחרי שנים עם עשרות עסקים: ההבדל בין קמפיין שמרוויח לקמפיין ששורף כסף הוא כמעט אף פעם לא הלידים עצמם. זה מה שקורה להם אחרי.\n\nליד שמקבל מענה תוך שעה שווה פי כמה מליד שמחכה ליום המחרת. ליד שמגיע לפגישה מוכן שווה פי כמה ממי שצריך לשכנע מאפס. בדיוק בשביל זה בנינו מערכת שמטפלת בכל השרשרת, לא רק בקליקים.\n\nבדוח שלך ראית מה הפוטנציאל. בפגישה מראים איך הופכים אותו למציאות אצלך:",
      bodyAfter: "",
      buttonLabel: "לתיאום 30 דקות עם סער",
      footnote: "",
    },
  },
  {
    key: "nurture7", label: "מעקב יום 7", when: "שבוע אחרי הדוח, למי שלא קבע פגישה",
    job: "סגירת מעגל בלי לחץ: להזכיר שהדוח שמור, ולהשאיר דלת פתוחה גם למי שמעדיף טלפון.",
    block: "teaser", button: "report", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "{שם}, הדוח שלך עדיין שמור",
      preheader: "הדלת פתוחה, בזמן שנוח לך",
      bodyBefore: "היי {שם},\n\nלפני שבוע הכנו לך דוח פוטנציאל, והוא עדיין שמור אצלנו על השם שלך.",
      bodyAfter: "אני לא אציף אותך במיילים. רק אגיד שאם תרצה לעבור על המספרים יחד, בזמן שנוח לך, הדלת פתוחה. ואם נוח לך יותר בטלפון, פשוט השב למייל הזה עם המספר ונחזור אליך.",
      buttonLabel: "לדוח שלך",
      footnote: "",
    },
  },
  {
    key: "reminder", label: "תזכורת יום לפני", when: "יום לפני הפגישה",
    job: "לוודא שהליד מגיע לפגישה, ושהוא מגיע מוכן: עם הדוח פתוח ושאלות בראש.",
    block: "meeting", button: "report", marketing: false, tokens: ["{שם}", "{מועד}"],
    defaults: {
      subject: "מחר נפגשים 👋 {מועד}",
      preheader: "קישור הזום ומה כדאי להכין",
      bodyBefore: "היי {שם},\n\nתזכורת קטנה: מחר בשעה שקבענו נפגשים בזום לעבור על דוח הפוטנציאל שלך.",
      bodyAfter: "שווה לפתוח את הדוח לפני, ולהכין כל שאלה שעולה לך. סער יעבור איתך על הכל, כולל הצצה חיה למתחרים שלך.",
      buttonLabel: "לרענון הדוח לפני הפגישה",
      footnote: "",
    },
  },
  {
    key: "reminder1h", label: "תזכורת שעה לפני", when: "כשעה לפני הפגישה",
    job: "להביא את הליד לזום בזמן: קצר, עם הקישור מול העיניים.",
    block: "none", button: "zoom", marketing: false, tokens: ["{שם}", "{שעה}"],
    defaults: {
      subject: "נפגשים בקרוב 🕐 היום ב-{שעה}",
      preheader: "הקישור לזום בפנים",
      bodyBefore: "היי {שם},\n\nהפגישה שלנו מתחילה בקרוב, היום ב-**{שעה}**. זה הקישור:",
      bodyAfter: "",
      buttonLabel: "להצטרפות לזום",
      footnote: "נתראה עוד מעט!",
    },
  },
  {
    key: "cancelled", label: "אחרי ביטול פגישה", when: "כשהפגישה מבוטלת ביומן",
    job: "להחזיר ליד שביטל בלי להאשים: לתת דרך קלה לקבוע מחדש.",
    block: "none", button: "start", marketing: false, tokens: ["{שם}"],
    defaults: {
      subject: "{שם}, נתפס לך משהו?",
      preheader: "אפשר לקבוע מועד חדש בדקה",
      bodyBefore: "היי {שם},\n\nראיתי שהפגישה שלנו ירדה מהיומן. קורה, החיים דינמיים.\n\nהדוח שלך עדיין שמור, והיומן של סער פתוח. אפשר לקבוע מועד חדש בדקה, או פשוט להשיב למייל הזה עם זמן שנוח לך.",
      bodyAfter: "",
      buttonLabel: "לקביעת מועד חדש",
      footnote: "",
    },
  },
];

export const EMAIL_KEYS = EMAIL_SPECS.map((s) => s.key);
export const specOf = (key: string): EmailSpec | undefined => EMAIL_SPECS.find((s) => s.key === key);

export interface TokenValues { name: string; field: string; when: string; time: string }

/** מחליף משתנים בנוסח. שם ריק נעלם יחד עם הפסיק או הרווח שלידו ("היי {שם}," הופך ל"היי,"). */
export function fillTokens(text: string, v: TokenValues): string {
  let out = text;
  if (v.name) out = out.replaceAll("{שם}", v.name);
  else out = out.replaceAll("{שם}, ", "").replaceAll(" {שם}", "").replaceAll("{שם}", "");
  return out
    .replaceAll("{תחום}", v.field ? `תחום ${v.field}` : "העסק שלך")
    .replaceAll("{מועד}", v.when)
    .replaceAll("{שעה}", v.time);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** טקסט שבעל הפורטל כתב הופך לפסקאות HTML בטוחות. **מודגש** נתמך, שום HTML אחר לא עובר. */
export function textToParagraphs(text: string, style = ""): string {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p${style ? ` style="${style}"` : ""}>${escapeHtml(p).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export const plainText = (text: string) => escapeHtml(text.replace(/[—–]/g, "-"));

/** ניקוי שדות שהגיעו מהעורך: חיתוך לאורך, בלי מקפים ארוכים, וכל מפתח חסר מקבל את ברירת המחדל */
export function sanitizeFields(input: Partial<Record<EmailFieldKey, unknown>>, fallback: EmailFields): EmailFields {
  const out = { ...fallback };
  for (const k of EMAIL_FIELD_KEYS) {
    if (typeof input[k] === "string") out[k] = (input[k] as string).replace(/[—–]/g, "-").replace(/\r/g, "").trim().slice(0, EMAIL_FIELD_LIMITS[k]);
  }
  return out;
}
