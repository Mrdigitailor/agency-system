// נתוני הדמו של טאב הדיוור: מספרים לכל מייל, שתי גרסאות למייל אחד (לפני ואחרי),
// והמלצות לדוגמה. הנוסחים עצמם הם ברירות המחדל האמיתיות של הרצף.
import { EMAIL_SPECS, BLOCK_LABELS, specOf, groupOf, type EmailKey } from "./email-templates";
import type { MailingRow, MailingDetail, EmailStats, AdviceItem } from "./mailing";

const stats = (sent: number, openPct: number, clickPct: number, advPct: number | null): EmailStats => ({
  sent, tracked: sent, opened: Math.round((sent * openPct) / 100), clicked: Math.round((sent * clickPct) / 100), bounced: 0,
  advanced: advPct === null ? 0 : Math.round((sent * advPct) / 100),
  openRate: openPct, clickRate: clickPct, advanceRate: advPct,
});

// המספרים של הגרסה הנוכחית של כל מייל. הפתיחה יורדת לאורך הרצף, כמו ברצף אמיתי.
const CURRENT: Record<EmailKey, EmailStats> = {
  report: stats(214, 78, 52, 14),
  nurture1: stats(96, 61, 24, 11),      // גרסה 2, אחרי שיפור הנושא
  nurture3: stats(151, 52, 15, 8),
  nurture5: stats(138, 47, 18, 9),
  nurture8: stats(124, 41, 11, 6),
  nurture12: stats(109, 44, 9, 5),
  reminder: stats(58, 83, 41, null),
  reminder1h: stats(55, 88, 69, null),
  cancelled: stats(17, 71, 35, 24),
  noshow: stats(11, 73, 45, 36),
};
const NURTURE1_V1 = stats(88, 42, 13, 5);
const NURTURE1_V2_SUBJECT = "{שם}, {חיפושים} חיפושים בחודש בתחום שלך. מה הם מקלידים?";
const NURTURE1_V1_SUBJECT = "{שם}, הספקת לעבור על המספרים?";

export const DEMO_MAILING: MailingRow[] = EMAIL_SPECS.map((spec) => ({
  key: spec.key, group: groupOf(spec.key), label: spec.label, when: spec.when, job: spec.job, enabled: true,
  version: spec.key === "nurture1" ? 2 : 1,
  subject: spec.key === "nurture1" ? NURTURE1_V2_SUBJECT : spec.defaults.subject,
  ...CURRENT[spec.key],
  sent: spec.key === "nurture1" ? CURRENT.nurture1.sent + NURTURE1_V1.sent : CURRENT[spec.key].sent,
}));

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600_000).toISOString();

const ADVICE: Partial<Record<EmailKey, AdviceItem[]>> = {
  nurture5: [
    { title: "נושא שמתחיל מהחשש של הליד", field: "subject",
      why: "סיבת הסירוב שחוזרת בשיחות עם הסוכן היא חוסר ודאות לגבי התקציב. נושא שמכיר בחשש הזה ישירות מדבר אל מי שמתלבט, והחשבון המלא נשאר בגוף המייל.",
      suggestion: "{שם}, אפשר לדעת מראש אם {תקציב} ₪ בחודש מספיקים" },
    { title: "לענות על השאלה שחוזרת בשיחות", field: "footnote",
      why: "השאלה השנייה הכי נפוצה בשיחות היא תוך כמה זמן רואים פניות. שורת סיום עונה עליה בלי לפגוע ברצף של המייל.",
      suggestion: "ושאלה שהרבה שואלים: כמה זמן עד שרואים פניות? בפגישה אני מראה לך לפי הנתונים של התחום שלך." },
    { title: "כפתור שמתאר מה מקבלים", field: "buttonLabel",
      why: "כפתור שמציין את התועלת ולא רק את הפעולה מוריד את החשש מפגישת מכירה.",
      suggestion: "לבדוק מאיזה תקציב כדאי להתחיל" },
  ],
  nurture12: [
    { title: "כותרת משנית שמבטיחה ערך", field: "preheader",
      why: "המייל האחרון ברצף נפתח פחות מהראשונים. כותרת משנית שמבהירה שיש בו סיכום שימושי נותנת סיבה לפתוח גם למי שהחליט לא להתקדם.",
      suggestion: "שלושה דברים ששווה לזכור, גם אם לא נדבר אף פעם" },
    { title: "כפתור שמתאים למי שעוד מתלבט", field: "buttonLabel",
      why: "מי שהגיע למייל האחרון בלי לקבוע פגישה בדרך כלל לא מוכן לשיחה. הזמנה לחזור לדוח בזמנו החופשי מתאימה לו יותר.",
      suggestion: "לשמור את הדוח לזמן שיתאים לי" },
  ],
};

export function demoMailingDetail(key: EmailKey): MailingDetail | null {
  const spec = specOf(key);
  if (!spec) return null;
  const isV2 = key === "nurture1";
  const fields = spec.defaults;
  const items = ADVICE[key];
  return {
    key, label: spec.label, when: spec.when, job: spec.job, tokens: spec.tokens,
    hasBlock: spec.block !== "none", blockLabel: BLOCK_LABELS[spec.block],
    enabled: true, version: isV2 ? 2 : 1, fields, defaults: spec.defaults,
    versions: isV2
      ? [
          { version: 2, createdAt: daysAgo(21), changeNote: "נכתב מחדש סביב הביטויים של הליד, במקום תזכורת כללית", current: true, ...CURRENT.nurture1 },
          { version: 1, createdAt: null, changeNote: `הנוסח המקורי: "${NURTURE1_V1_SUBJECT}"`, current: false, ...NURTURE1_V1 },
        ]
      : [{ version: 1, createdAt: null, changeNote: "הנוסח המקורי", current: true, ...CURRENT[key] }],
    advice: items ? { items, createdAt: daysAgo(1), version: 1 } : null,
    canAdvise: !items,
  };
}
