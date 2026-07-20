"use client";

interface ProgressBarProps {
  current: number;
  target: number;
  /** true = lower is better (e.g. cost per conversion) */
  inverted?: boolean;
  /**
   * חלק התקופה שעבר (0..1) — למדד כמותי עם יעד חודשי. כשמסופק, הצבע נקבע לפי
   * הקצב (האם עומדים בקצב ליעד עד סוף החודש) ולא לפי היחס הגולמי.
   * למשל: יעד 100 המרות, עברו 20% מהחודש → 20 המרות = בדיוק בקצב = ירוק.
   */
  pace?: number;
  /**
   * חלק החודש שעבר (0..1) — לתקציב. כשמסופק, מקרינים את קצב ההוצאה עד היום
   * לסוף החודש וצובעים לפי צפי חריגה (לא לפי כמה נוצל עד עכשיו). מוסיף גם
   * קו-סמן במיקום ה"קצב התקין" — מילוי שעובר אותו = הוצאה מהירה מדי.
   * למשל: תקציב ₪10K, עברו 20% מהחודש, הוצאו ₪4K → צפי ₪20K = חריגה = אדום.
   */
  budgetPace?: number;
}

export default function ProgressBar({ current, target, inverted = false, pace, budgetPace }: ProgressBarProps) {
  if (target <= 0) return <div className="h-1.5 w-full rounded-full bg-brand-border" />;

  const ratio = current / target;
  let color: string;

  if (budgetPace !== undefined && budgetPace > 0) {
    // תקציב עם קצב חודשי — צבע לפי צפי סוף-חודש (הקרנת הקצב היומי) מול התקציב
    const projectedRatio = ratio / budgetPace; // = הוצאה-מוקרנת / תקציב
    if (projectedRatio <= 1.0) color = "bg-brand-success";
    else if (projectedRatio <= 1.1) color = "bg-brand-warning";
    else color = "bg-brand-danger";
  } else if (inverted) {
    // עלות — ירוק כל עוד עומדים ביעד או מתחתיו, כתום בחריגה עד 25%, אדום מעל 25%
    if (ratio <= 1.0) color = "bg-brand-success";
    else if (ratio <= 1.25) color = "bg-brand-warning";
    else color = "bg-brand-danger";
  } else if (pace !== undefined && pace > 0) {
    // כמות עם קצב חודשי — עקפנו יעד = ירוק; אחרת משווים לקצב הצפוי עד היום
    if (ratio >= 1) color = "bg-brand-success";
    else {
      const paceRatio = current / (target * pace);
      if (paceRatio >= 0.9) color = "bg-brand-success";
      else if (paceRatio >= 0.7) color = "bg-brand-warning";
      else color = "bg-brand-danger";
    }
  } else {
    // כמות — ירוק אם עומדים ביעד, כתום אם קרובים, אדום אם נמוך
    if (ratio >= 0.85) color = "bg-brand-success";
    else if (ratio >= 0.6) color = "bg-brand-warning";
    else color = "bg-brand-danger";
  }

  const width = Math.min(ratio * 100, 100);
  // קו-סמן ל"קצב תקין" (רק במצב תקציב) — המיקום נמדד מצד ההתחלה (ימין ב-RTL)
  const markerPos = budgetPace !== undefined && budgetPace > 0 ? Math.min(budgetPace * 100, 100) : null;

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-brand-border">
      <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${width}%` }} />
      {markerPos !== null && (
        <div className="absolute top-0 h-full w-0.5 bg-brand-dark/50" style={{ right: `${markerPos}%` }} title="קצב תקין ליום זה" />
      )}
    </div>
  );
}
