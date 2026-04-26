/**
 * מחזיר את טווח השבוע האחרון שהסתיים (ראשון-שבת).
 *
 * הלוגיקה:
 * - שבוע = ראשון עד שבת
 * - "השבוע שעבר" = השבוע המלא האחרון שהסתיים
 * - ביום ראשון: אתמול היה שבת → השבוע 7 ימים אחורה
 * - ביום שבת: השבוע הנוכחי עדיין לא הסתיים → השבוע שלפניו
 *
 * דוגמאות (2026):
 * - ראשון 26.04 → daysBack=1 → שבת=25.04 → ראשון=19.04 → 19.04-25.04
 * - שני 27.04   → daysBack=2 → שבת=25.04 → ראשון=19.04 → 19.04-25.04
 * - שבת 25.04   → daysBack=7 → שבת=18.04 → ראשון=12.04 → 12.04-18.04
 */
export function getLastWeekRange(): { start: Date; end: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay(); // 0=ראשון, 6=שבת

  // כמה ימים אחורה ל-שבת האחרונה שסיימה שבוע מלא
  const daysBack = day === 6 ? 7 : day + 1;

  const lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - daysBack);

  const lastSunday = new Date(lastSaturday);
  lastSunday.setDate(lastSaturday.getDate() - 6);

  return { start: lastSunday, end: lastSaturday };
}

/**
 * מחזיר טווח שבועי N שבועות אחורה (0 = שבוע אחרון)
 */
export function getWeekRangeBack(weeksBack: number): { start: Date; end: Date } {
  const { start, end } = getLastWeekRange();
  const s = new Date(start);
  const e = new Date(end);
  s.setDate(s.getDate() - weeksBack * 7);
  e.setDate(e.getDate() - weeksBack * 7);
  return { start: s, end: e };
}

/**
 * מחזיר את טווח השבוע שחלף יחסית לתאריך נתון (לא בהכרח היום).
 * שימוש: כשדוח סומן כנשלח ב-dateStr, מה השבוע שהוא מכסה?
 */
export function getWeekRangeForDate(dateStr: string): { start: Date; end: Date } {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const daysBack = day === 6 ? 7 : day + 1;

  const lastSaturday = new Date(date);
  lastSaturday.setDate(date.getDate() - daysBack);

  const lastSunday = new Date(lastSaturday);
  lastSunday.setDate(lastSaturday.getDate() - 6);

  return { start: lastSunday, end: lastSaturday };
}

/**
 * פורמט טווח שבועי לתצוגה: "19.04-25.04.2026"
 */
export function formatWeekRange(start: Date, end: Date): string {
  const fmtShort = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  const fmtFull = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmtShort(start)}-${fmtFull(end)}`;
}
