// שרשרת החישוב של דוח הפוטנציאל — מתמטיקה בלבד, אפס AI.
// הכללים שסוכמו עם סער:
//  - מספר הכותרת מחושב ממחיר קליק אמצעי; הטווח המלא מוצג כפירוט משני
//  - המרה בדף: 5% (הקצה השמרני של יעד 5%-10%)
//  - סגירה: מוצר עד 1,500 ₪ ← 10% · מעל 1,500 ₪ ← 5% (בנצ'מרק שמרני, לא המספר של הלקוח)
//  - תקרת קליקים: לא קונים יותר מ-35% מנפח החיפוש
//  - ריטיינר: שווי לקוח מלא = עסקה ראשונה + חודשי × אורך חיים
import type { ResearchResult } from "./research";

export const PAGE_CONV = 0.05;
export const VOLUME_SHARE_CAP = 0.35;
export const CHEAP_THRESHOLD = 1500;
export const CLOSE_RATE_CHEAP = 0.10;
export const CLOSE_RATE_EXPENSIVE = 0.05;

export interface VerdictInput {
  budget: number;         // תקציב פרסום חודשי ₪
  dealFirst: number;      // שווי עסקה ראשונה / דמי הקמה
  monthlyFee: number;     // ריטיינר חודשי (0 אם אין)
  lifetimeMonths: number; // אורך חיי לקוח ממוצע
}

export interface Chain {
  ok: boolean;            // האם יש מספיק נתונים למספר אמין
  reason?: string;        // אם לא — למה (מוביל למסלול "בוא נדבר")
  closeRate: number;
  pageConv: number;
  cpcMid: number;
  clicks: { head: number; best: number; worst: number };
  leads: { head: number; best: number; worst: number };
  deals: { head: number; best: number };   // עסקאות בחודש
  dealValueFirst: number;
  dealValueFull: number;  // כולל ריטיינר לאורך החיים
  revenueFirst: { head: number; best: number }; // ₪ בחודש מעסקאות ראשונות
  revenueFull: { head: number; best: number };  // ₪ בחודש בשווי לקוח מלא
  monthsToFirstDeal: number; // בתרחיש המייצג
}

export function computeChain(r: ResearchResult, input: VerdictInput): Chain {
  const empty = { head: 0, best: 0, worst: 0 };
  const base: Omit<Chain, "ok" | "reason"> = {
    closeRate: 0, pageConv: PAGE_CONV, cpcMid: r.cpc.mid,
    clicks: empty, leads: empty, deals: { head: 0, best: 0 },
    dealValueFirst: input.dealFirst, dealValueFull: input.dealFirst,
    revenueFirst: { head: 0, best: 0 }, revenueFull: { head: 0, best: 0 },
    monthsToFirstDeal: 0,
  };

  // ביטחון: בלי מספיק ביטויים, נפח או מחירים — לא ממציאים מספר
  if (r.kept.length < 5) return { ...base, ok: false, reason: "פחות מ-5 ביטויי חיפוש רלוונטיים בתחום" };
  if (r.totalVol < 100) return { ...base, ok: false, reason: "נפח חיפוש חודשי נמוך מדי בתחום" };
  if (!r.cpc.mid || !r.cpc.low) return { ...base, ok: false, reason: "אין נתוני מחיר לקליק מגוגל" };
  if (input.budget <= 0) return { ...base, ok: false, reason: "לא הוזן תקציב" };

  // רף המחיר לקביעת אחוז הסגירה — לפי הסכום המשמעותי שהלקוח משלם
  const priceBasis = Math.max(input.dealFirst, input.monthlyFee);
  const closeRate = priceBasis > CHEAP_THRESHOLD ? CLOSE_RATE_EXPENSIVE : CLOSE_RATE_CHEAP;

  const cap = r.totalVol * VOLUME_SHARE_CAP;
  const clicks = {
    head: Math.min(input.budget / r.cpc.mid, cap),
    best: Math.min(input.budget / r.cpc.low, cap),
    worst: Math.min(input.budget / r.cpc.high, cap),
  };
  const leads = { head: clicks.head * PAGE_CONV, best: clicks.best * PAGE_CONV, worst: clicks.worst * PAGE_CONV };
  const deals = { head: leads.head * closeRate, best: leads.best * closeRate };

  const dealValueFull = input.dealFirst + (input.monthlyFee > 0 ? input.monthlyFee * Math.max(input.lifetimeMonths, 1) : 0);

  return {
    ...base, ok: true, closeRate,
    clicks: { head: Math.round(clicks.head), best: Math.round(clicks.best), worst: Math.round(clicks.worst) },
    leads: { head: +leads.head.toFixed(1), best: +leads.best.toFixed(1), worst: +leads.worst.toFixed(1) },
    deals: { head: +deals.head.toFixed(2), best: +deals.best.toFixed(2) },
    dealValueFull,
    revenueFirst: { head: Math.round(deals.head * input.dealFirst), best: Math.round(deals.best * input.dealFirst) },
    revenueFull: { head: Math.round(deals.head * dealValueFull), best: Math.round(deals.best * dealValueFull) },
    monthsToFirstDeal: deals.head > 0 ? +(1 / deals.head).toFixed(1) : 0,
  };
}
