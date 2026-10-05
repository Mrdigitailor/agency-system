// נתוני הדמו של טאב הדיוור: מספרים לכל מייל, שתי גרסאות למייל אחד (לפני ואחרי),
// והמלצות לדוגמה. הנוסחים עצמם הם ברירות המחדל האמיתיות של הרצף.
import { EMAIL_SPECS, specOf, type EmailKey } from "./email-templates";
import type { MailingRow, MailingDetail, EmailStats, AdviceItem } from "./mailing";

const stats = (sent: number, openPct: number, clickPct: number, advPct: number | null): EmailStats => ({
  sent, tracked: sent, opened: Math.round((sent * openPct) / 100), clicked: Math.round((sent * clickPct) / 100), bounced: 0,
  advanced: advPct === null ? 0 : Math.round((sent * advPct) / 100),
  openRate: openPct, clickRate: clickPct, advanceRate: advPct,
});

// המספרים של הגרסה הנוכחית של כל מייל
const CURRENT: Record<EmailKey, EmailStats> = {
  report: stats(214, 78, 52, 14),
  nurture1: stats(96, 61, 24, 11),      // גרסה 2, אחרי שיפור הנושא
  nurture3: stats(151, 44, 12, 6),
  nurture7: stats(129, 39, 9, 4),
  reminder: stats(58, 83, 41, null),
  reminder1h: stats(55, 88, 69, null),
  cancelled: stats(17, 71, 35, 24),
};
const NURTURE1_V1 = stats(88, 42, 13, 5);
const NURTURE1_V2_SUBJECT = "{שם}, שאלה קצרה על הדוח ששלחתי";

export const DEMO_MAILING: MailingRow[] = EMAIL_SPECS.map((spec) => ({
  key: spec.key, label: spec.label, when: spec.when, job: spec.job, enabled: true,
  version: spec.key === "nurture1" ? 2 : 1,
  subject: spec.key === "nurture1" ? NURTURE1_V2_SUBJECT : spec.defaults.subject,
  ...CURRENT[spec.key],
  sent: spec.key === "nurture1" ? CURRENT.nurture1.sent + NURTURE1_V1.sent : CURRENT[spec.key].sent,
}));

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600_000).toISOString();

const ADVICE: Partial<Record<EmailKey, AdviceItem[]>> = {
  nurture3: [
    { title: "נושא שמדבר על הליד ולא עלינו", field: "subject",
      why: "הנושא הנוכחי נשמע כמו כותרת של מאמר. אחוז הפתיחה של המייל הזה נמוך מהמיילים שלפניו, ונושא אישי בדרך כלל נפתח יותר.",
      suggestion: "{שם}, מה קורה לליד אחרי שהוא משאיר פרטים" },
    { title: "לענות על השאלה שחוזרת בשיחות", field: "bodyAfter",
      why: "השאלה השנייה הכי נפוצה בשיחות עם הסוכן היא תוך כמה זמן רואים פניות. המייל הזה הוא המקום הטבעי לענות עליה.",
      suggestion: "ושאלה שהרבה שואלים: תוך כמה זמן רואים פניות ראשונות? ברוב התחומים בתוך שבועיים עד שלושה מרגע שהקמפיין באוויר." },
    { title: "כפתור שמתאר מה מקבלים", field: "buttonLabel",
      why: "כפתור שמציין את התועלת ולא רק את הפעולה מוריד את החשש מפגישת מכירה.",
      suggestion: "לראות איך זה נראה אצלי" },
  ],
  nurture7: [
    { title: "לפתוח בשאלה במקום בתזכורת", field: "bodyBefore",
      why: "המייל האחרון ברצף נפתח הכי מעט. שאלה ישירה שקל לענות עליה מייצרת תשובות, ותשובה שווה יותר מהקלקה.",
      suggestion: "היי {שם},\n\nשאלה קצרה: הדוח ששלחתי לך לפני שבוע עדיין רלוונטי, או שהעניין ירד מהפרק?" },
    { title: "כותרת משנית שמשלימה את הנושא", field: "preheader",
      why: "הכותרת המשנית חוזרת על הנושא. עדיף שהיא תוסיף סיבה לפתוח.",
      suggestion: "תשובה של מילה אחת מספיקה לי" },
  ],
};

export function demoMailingDetail(key: EmailKey): MailingDetail | null {
  const spec = specOf(key);
  if (!spec) return null;
  const isV2 = key === "nurture1";
  const fields = isV2 ? { ...spec.defaults, subject: NURTURE1_V2_SUBJECT, preheader: "רציתי לוודא שהוא הגיע, ולשמוע מה חשבת" } : spec.defaults;
  const items = ADVICE[key];
  return {
    key, label: spec.label, when: spec.when, job: spec.job, tokens: spec.tokens,
    hasBlock: spec.block !== "none", blockLabel: spec.block === "teaser" ? "קופסת המספרים" : spec.block === "meeting" ? "קופסת מועד הפגישה" : "",
    enabled: true, version: isV2 ? 2 : 1, fields, defaults: spec.defaults,
    versions: isV2
      ? [
          { version: 2, createdAt: daysAgo(21), changeNote: "נושא אישי יותר וכותרת משנית חדשה", current: true, ...CURRENT.nurture1 },
          { version: 1, createdAt: null, changeNote: "הנוסח המקורי", current: false, ...NURTURE1_V1 },
        ]
      : [{ version: 1, createdAt: null, changeNote: "הנוסח המקורי", current: true, ...CURRENT[key] }],
    advice: items ? { items, createdAt: daysAgo(1), version: 1 } : null,
    canAdvise: !items,
  };
}
