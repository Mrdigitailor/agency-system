"use client";

interface ProgressBarProps {
  current: number;
  target: number;
  /** true = lower is better (e.g. cost per conversion) */
  inverted?: boolean;
}

export default function ProgressBar({ current, target, inverted = false }: ProgressBarProps) {
  if (target <= 0) return <div className="h-1.5 w-full rounded-full bg-brand-border" />;

  const ratio = current / target;
  let color: string;

  if (inverted) {
    // עלות — ירוק אם מתחת ליעד, כתום אם קרוב, אדום אם בחריגה
    if (ratio <= 0.85) color = "bg-brand-success";
    else if (ratio <= 1.0) color = "bg-brand-warning";
    else color = "bg-brand-danger";
  } else {
    // כמות — ירוק אם עומדים ביעד, כתום אם קרובים, אדום אם נמוך
    if (ratio >= 0.85) color = "bg-brand-success";
    else if (ratio >= 0.6) color = "bg-brand-warning";
    else color = "bg-brand-danger";
  }

  const width = Math.min(ratio * 100, 100);

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-border">
      <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${width}%` }} />
    </div>
  );
}
