// רצף הדיוור כנתונים: לכל מייל יש תפקיד אחד, מבנה קבוע, ונוסח שאפשר לערוך.
// המבנה (קופסת המספרים, כפתור, חתימה) קבוע בקוד כדי שהמיילים יישארו נקיים ואחידים.
// הנוסח (נושא, כותרת משנית, טקסטים, טקסט הכפתור) נערך בטאב הדיוור ונשמר כגרסאות.
// הקובץ הזה טהור: בלי גישה לבסיס הנתונים, כדי שגם הדמו והתצוגה המקדימה ישתמשו בו.

export type EmailKey = "report" | "nurture1" | "nurture3" | "nurture5" | "nurture8" | "nurture12" | "reminder" | "reminder1h" | "cancelled";

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
  afterDays?: number;                    // מיילי המשך: כמה ימים אחרי הדוח המייל נשלח
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
  // ---- רצף ההמשך: לכל מייל תפקיד אחד, שאלה אחת שהוא סוגר אצל הליד ----
  {
    key: "nurture1", label: "יום 1: איך בוחרים ספק", when: "יום אחרי הדוח, למי שלא קבע פגישה", afterDays: 1,
    job: "לתת לליד את אמות המידה שלפיהן ישפוט כל ספק, כולל את המתחרים שלנו. מראה שמבינים את הבעיה שלו, בלי למכור.",
    block: "none", button: "report", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "{שם}, שלוש שאלות לפני שבוחרים מי יפרסם אותך",
      preheader: "הן יעזרו לך להשוות בין הצעות, גם אם לא תבחר בנו",
      bodyBefore: "היי {שם},\n\nאתמול שלחתי לך את דוח הפוטנציאל של {תחום}. אם עוד לא הספקת לפתוח אותו, הוא מחכה לך בקישור למטה.\n\nבינתיים, משהו שיעזור לך בלי קשר אלינו. אם אתה בודק עכשיו כמה אפשרויות לפרסום בגוגל, אלה שלוש השאלות ששווה לשאול כל מי שמציע לך הצעה:\n\n**1. מה קורה לליד בדקות הראשונות?** ליד שמקבל מענה מהר נסגר הרבה יותר מליד שמחכה ליום המחרת. שאל מי עונה לו, ותוך כמה זמן.\n\n**2. מה אני רואה בעצמי?** לא דוח חודשי מסכם, אלא כל פנייה: מאיפה היא הגיעה, מה נשאל בה, ומה קרה איתה.\n\n**3. מה קורה למי שלא סגר מיד?** רוב הלידים לא מחליטים ביום הראשון. שאל אם מישהו ממשיך לטפל בהם, או שהם פשוט נעלמים.",
      bodyAfter: "",
      buttonLabel: "לדוח שלך",
      footnote: "אם תרצה לשמוע איך אנחנו עונים על שלוש השאלות האלה, פשוט השב למייל הזה.",
    },
  },
  {
    key: "nurture3", label: "יום 3: סיפור לקוח", when: "שלושה ימים אחרי הדוח, למי שלא קבע פגישה", afterDays: 3,
    job: "להראות שזה עבד למישהו אמיתי, בלי להבטיח לליד את אותה תוצאה.",
    block: "none", button: "start", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "היעד היה 5 מופעים בחודש. היא סגרה 16",
      preheader: "סיפור קצר של לקוחה שלנו",
      bodyBefore: "היי {שם},\n\nרציתי לשתף אותך בסיפור קצר של לקוחה שלנו.\n\nנועה טויטו היא היוצרת של המופע \"בלבוסטע\". היעד שהיא הציבה לעצמה היה חמישה מופעים בחודש.\n\nכך היא תיארה את מה שקרה: \"כל קמפיין עם מאות פניות. בחודש ימים בלבד סגרתי 16 מופעים, כשהיעד היה חמישה.\"\n\nאני מספר את זה לא כדי להבטיח לך את אותו מספר. כל תחום שונה, ובדיוק בגלל זה הכנו לך דוח עם הנתונים של {תחום} ולא הערכה כללית.\n\nמה שכן חוזר אצל כל לקוח: כשיודעים מראש כמה אנשים מחפשים את השירות, כמה עולה להגיע אליהם ומה קורה לכל פנייה, מפסיקים לנחש.",
      bodyAfter: "",
      buttonLabel: "לקביעת 30 דקות על הנתונים שלך",
      footnote: "",
    },
  },
  {
    key: "nurture5", label: "יום 5: כמה להשקיע", when: "חמישה ימים אחרי הדוח, למי שלא קבע פגישה", afterDays: 5,
    job: "לענות על ההתנגדות המרכזית: כמה צריך להשקיע, ומה אם זה לא ישתלם. תשובה ישרה, בלי הבטחות.",
    block: "teaser", button: "start", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "{שם}, כמה צריך להשקיע כדי שזה ישתלם?",
      preheader: "השאלה שכמעט כולם שואלים, ותשובה ישרה",
      bodyBefore: "היי {שם},\n\nהשאלה שאני שומע הכי הרבה מבעלי עסקים היא לא האם לפרסם בגוגל. היא כמה כסף צריך לשים כדי לדעת אם זה עובד.\n\nהתשובה הישרה: זה תלוי בתחום, ולכן לא עניתי לך במספר כללי. הדוח שלך חושב לפי מחירי הקליק האמיתיים של {תחום} ולפי התקציב שבחרת:",
      bodyAfter: "שני דברים שחשוב לדעת על המספר הזה:\n\n**זה פוטנציאל, לא הבטחה.** הוא מראה מה אפשרי כשהקמפיין, הדף והטיפול בפניות עובדים כמו שצריך.\n\n**לא חייבים להתחיל בתקציב מלא.** אפשר להתחיל נמוך יותר, למדוד כמה שבועות, ולהגדיל רק כשרואים שהפניות מגיעות.\n\nבפגישה אני עובר איתך על החישוב ואומר לך מאיזה תקציב הגיוני להתחיל בתחום שלך. גם אם התשובה היא שעדיף לחכות.",
      buttonLabel: "לקביעת פגישה",
      footnote: "",
    },
  },
  {
    key: "nurture8", label: "יום 8: מי מאחורי העסק", when: "שמונה ימים אחרי הדוח, למי שלא קבע פגישה", afterDays: 8,
    job: "קרבה: להראות מי האדם שמאחורי העסק, ולמה השירות בנוי כמו שהוא בנוי.",
    block: "none", button: "start", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "{שם}, מי בעצם יושב מולך בפגישה",
      preheader: "קצת עליי, ולמה בנינו את זה ככה",
      bodyBefore: "היי {שם},\n\nעד עכשיו שלחתי לך מספרים. הפעם משהו אישי יותר, כי לפני שנותנים למישהו לנהל את הפרסום של העסק, רוצים לדעת מי הוא.\n\nאני סער, המייסד של Mr.digitailor. את הפגישה איתך אני עושה בעצמי, לא איש מכירות.\n\nלמה בנינו את השירות הזה כמו שבנינו? כי ראינו שוב ושוב עסקים שמשלמים על קמפיין, מקבלים פניות, והפניות הולכות לאיבוד: אף אחד לא ענה בזמן, ואף אחד לא חזר למי שהתלבט. הקמפיין היה בסדר. מה שקרה אחריו לא.\n\nלכן אנחנו לא מוכרים רק קמפיין. אנחנו בונים את כל המסלול: הדף שהגולש מגיע אליו, הסוכן שעונה לו מיד, המיילים שממשיכים ללוות אותו, והמערכת שבה אתה רואה כל פנייה.\n\nבפגישה של 30 דקות בזום נעבור על הנתונים של {תחום}, נסתכל יחד על המתחרים שלך, ותצא עם תמונה ברורה. בין אם נעבוד יחד ובין אם לא.",
      bodyAfter: "",
      buttonLabel: "לקביעת פגישה איתי",
      footnote: "",
    },
  },
  {
    key: "nurture12", label: "יום 12: סגירת מעגל", when: "שנים עשר ימים אחרי הדוח, למי שלא קבע פגישה", afterDays: 12,
    job: "סגירת מעגל בלי לחץ: מייל אחרון ברצף, עם דרך קלה לחזור אלינו.",
    block: "none", button: "report", marketing: true, tokens: ["{שם}", "{תחום}"],
    defaults: {
      subject: "{שם}, לסגור את הנושא או להשאיר פתוח?",
      preheader: "תשובה של מילה אחת מספיקה לי",
      bodyBefore: "היי {שם},\n\nזה המייל האחרון שאני שולח לך בנושא. אני לא רוצה להציף אותך.\n\nהדוח של {תחום} נשאר שמור על השם שלך, ואפשר לחזור אליו מתי שתרצה.\n\nאם העניין עדיין רלוונטי, אפשר להשיב למייל הזה עם מספר טלפון ואחזור אליך. ואם זה לא הזמן, גם זה בסדר גמור. תשובה של מילה אחת תעזור לי לדעת.",
      bodyAfter: "",
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
/** מיילי ההמשך לפי סדר השליחה, עם מספר הימים אחרי הדוח */
export const NURTURE_SCHEDULE = EMAIL_SPECS.filter((s) => s.afterDays !== undefined)
  .map((s) => ({ key: s.key, afterDays: s.afterDays as number })).sort((x, y) => x.afterDays - y.afterDays);
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
