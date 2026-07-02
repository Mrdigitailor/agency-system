// מנוע זיהוי ירידות ביצועים — רץ על הדאטה היומי המסונכרן, בלי לגעת בחשבונות.
// משווה 7 ימים אחרונים (מסתיימים אתמול) מול 7 הימים שלפניהם, + חודש-עד-היום מול יעד.
import { prisma } from "@/lib/db/prisma";
import { daysAgoIL, monthStartIL } from "@/lib/utils/ildate";
import { loadClientCtx, computeSnapshot, type DateRange, type PlatformSnapshot } from "@/lib/dashboard/engine";

const RECENT_DAYS = 7;
const FLAG_THRESHOLD = 30; // ניקוד מינימלי לסימון לקוח

export function recentRange(): DateRange {
  return { since: daysAgoIL(RECENT_DAYS), until: daysAgoIL(1) }; // 7 ימים שמסתיימים אתמול (שעון ישראל)
}
export function baselineRange(): DateRange {
  return { since: daysAgoIL(RECENT_DAYS * 2), until: daysAgoIL(RECENT_DAYS + 1) }; // 7 הימים שלפני כן
}
export function mtdRange(): DateRange {
  return { since: monthStartIL(), until: daysAgoIL(1) };
}

/** תיאור התאריכים שנותחו — לשקיפות באבחון ("מול אילו תאריכים השוויתי") */
export function datesLabel(): string {
  const dm = (s: string) => { const [, mo, d] = s.split("-"); return `${d}/${mo}`; };
  const r = recentRange(), b = baselineRange();
  return `7 ימים אחרונים (${dm(r.since)}–${dm(r.until)}) מול 7 הימים שלפניהם (${dm(b.since)}–${dm(b.until)})`;
}

export interface Signal {
  code: string;
  label: string;
  severity: number; // 0-100
  detail: string;
}

export interface ClientDetection {
  clientId: string;
  clientName: string;
  currency: string;
  clientType: string;
  score: number;
  signals: Signal[];
  recent: PlatformSnapshot;
  baseline: PlatformSnapshot;
  mtdSpend: number;
  mtdCpa: number;
  targetCpa: number;
  monthlyBudget: number;
}

/** רצפת הוצאה שבועית מינימלית כדי להתחשב בלקוח — מדורגת לתקציב, עם רצפה אבסולוטית */
function weeklyFloor(monthlyBudget: number): number {
  return Math.max(monthlyBudget * 0.05, 50);
}

/** מזהה סיגנלים ללקוח בודד. מחזיר null אם אין מספיק פעילות. */
export async function detectClientIssues(client: { id: string; name: string; monthlyBudget: number; targetCostPerConversion: number }): Promise<ClientDetection | null> {
  const ctx = await loadClientCtx(client.id);
  if (!ctx) return null;

  const [recentSnap, baseSnap, mtdSnap] = await Promise.all([
    computeSnapshot(ctx, recentRange()),
    computeSnapshot(ctx, baselineRange()),
    computeSnapshot(ctx, mtdRange()),
  ]);
  const recent = recentSnap.ad.all;
  const baseline = baseSnap.ad.all;
  const mtd = mtdSnap.ad.all;

  const floor = weeklyFloor(client.monthlyBudget);
  // אם אין הוצאה משמעותית בשני החלונות — אין על מה לדבר
  if (recent.spend < floor && baseline.spend < floor) return null;

  const signals: Signal[] = [];
  const isEcom = ctx.clientType === "ecom";

  // עוצמת סטייה → severity, משוקללת בהוצאה-בסיכון (עד פי 1)
  const spendWeight = Math.min(1, Math.max(recent.spend, baseline.spend) / Math.max(floor * 3, 1));
  const sev = (deviation: number, cap = 60) => Math.round(Math.min(cap, Math.abs(deviation) * 80) * (0.4 + 0.6 * spendWeight));

  // CPA עלה
  if (baseline.conversions >= 3 && baseline.cpa > 0 && recent.spend >= floor) {
    const dev = recent.cpa / baseline.cpa - 1;
    if (dev > 0.25) signals.push({ code: "CPA_UP", label: "עלייה בעלות להמרה", severity: sev(dev), detail: `עלות להמרה עלתה ${Math.round(dev * 100)}% (מ-${Math.round(baseline.cpa)} ל-${Math.round(recent.cpa)})` });
  }
  // המרות ירדו
  if (baseline.conversions >= 4) {
    const dev = recent.conversions / baseline.conversions - 1;
    if (dev <= -0.3) signals.push({ code: "CONV_DOWN", label: "ירידה בהמרות", severity: sev(dev), detail: `המרות ירדו ${Math.round(-dev * 100)}% (מ-${Math.round(baseline.conversions)} ל-${Math.round(recent.conversions)})` });
  }
  // ROAS ירד (איקום)
  if (isEcom && baseline.roas > 0 && recent.spend >= floor) {
    const dev = recent.roas / baseline.roas - 1;
    if (dev < -0.2) signals.push({ code: "ROAS_DOWN", label: "ירידה ב-ROAS", severity: sev(dev), detail: `ROAS ירד ${Math.round(-dev * 100)}% (מ-${baseline.roas.toFixed(1)} ל-${recent.roas.toFixed(1)})` });
  }
  // קריסת הוצאה (בעיית delivery)
  if (baseline.spend >= floor) {
    const dev = recent.spend / baseline.spend - 1;
    if (dev < -0.5) signals.push({ code: "SPEND_COLLAPSE", label: "צניחת הוצאה", severity: sev(dev, 50), detail: `ההוצאה צנחה ${Math.round(-dev * 100)}% — ייתכן שקמפיינים הפסיקו להוציא` });
  }
  // הוצאה עלתה אבל המרות לא
  if (baseline.spend >= floor && recent.spend > baseline.spend * 1.2 && recent.conversions <= baseline.conversions * 1.02) {
    signals.push({ code: "INEFFICIENT", label: "הוצאה עולה בלי תוצאות", severity: sev(0.4, 45), detail: `ההוצאה עלתה ${Math.round((recent.spend / baseline.spend - 1) * 100)}% אבל ההמרות לא — יעילות יורדת` });
  }
  // חריגה מיעד (MTD)
  const mtdCpa = mtd.conversions > 0 ? mtd.spend / mtd.conversions : 0;
  if (client.targetCostPerConversion > 0 && mtdCpa > 0 && mtdCpa > client.targetCostPerConversion * 1.15) {
    const dev = mtdCpa / client.targetCostPerConversion - 1;
    signals.push({ code: "TARGET_MISS", label: "חריגה מיעד CPA", severity: sev(dev, 50), detail: `עלות להמרה החודש ${Math.round(mtdCpa)} מול יעד ${Math.round(client.targetCostPerConversion)} (חריגה ${Math.round(dev * 100)}%)` });
  }

  if (signals.length === 0) return null;

  // ניקוד: הסיגנל החזק + חלק מהשאר
  const sorted = [...signals].sort((a, b) => b.severity - a.severity);
  const score = Math.round(sorted[0].severity + 0.35 * sorted.slice(1).reduce((s, x) => s + x.severity, 0));

  return {
    clientId: client.id,
    clientName: client.name,
    currency: ctx.currency,
    clientType: ctx.clientType,
    score,
    signals: sorted,
    recent,
    baseline,
    mtdSpend: mtd.spend,
    mtdCpa,
    targetCpa: client.targetCostPerConversion,
    monthlyBudget: client.monthlyBudget,
  };
}

/** סורק את כל הלקוחות הפעילים ומחזיר את המסומנים (ניקוד ≥ סף), ממוינים יורד. */
export async function detectAllClients(): Promise<ClientDetection[]> {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: { not: "inactive" } },
    select: { id: true, name: true, monthlyBudget: true, targetCostPerConversion: true },
  });

  const results = await Promise.all(clients.map((c) => detectClientIssues(c).catch(() => null)));
  return results
    .filter((r): r is ClientDetection => r !== null && r.score >= FLAG_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}
