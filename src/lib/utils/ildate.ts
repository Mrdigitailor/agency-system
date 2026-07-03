// תאריכים לפי שעון ישראל — השרת רץ ב-UTC, אז גם new Date().getDate() "מקומי" הוא UTC.
// כל חישוב תאריך עסקי (חודש נוכחי, אתמול, טווחים) חייב לעבור כאן, אחרת בין חצות
// ל-03:00 שעון ישראל המערכת חושבת שזה עדיין "אתמול".

const IL_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });

/** תאריך YYYY-MM-DD לפי שעון ישראל עבור רגע נתון (ברירת מחדל: עכשיו) */
export function ymdIL(d: Date = new Date()): string {
  return IL_FMT.format(d); // en-CA = YYYY-MM-DD
}

/** היום בישראל */
export function todayIL(): string {
  return ymdIL();
}

/** לפני N ימים (לפי שעון ישראל) */
export function daysAgoIL(n: number): string {
  return ymdIL(new Date(Date.now() - n * 86400000));
}

/** מזיז תאריך YYYY-MM-DD ב-N ימים (חשבון תאריך טהור ב-UTC, בלי תלות באזור זמן) */
export function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** ה-1 בחודש הנוכחי בישראל */
export function monthStartIL(): string {
  return `${todayIL().slice(0, 7)}-01`;
}

/** מספר היום בחודש לפי שעון ישראל (1-31) */
export function dayOfMonthIL(): number {
  return Number(todayIL().slice(8, 10));
}
