// Helpers לספירת המרות Google Ads לפי conversion actions שנבחרו —
// מקביל ל-metaMetrics. אם לא נבחרו פעולות — מחזיר את ההמרות הכוללות.

interface GoogleRow {
  conversions: number;
  conversionsByAction: string; // JSON { actionName: count }
}

/** פיענוח googleConversionAction — JSON array או ערך בודד */
export function parseGoogleActions(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string" && s);
    return [];
  } catch {
    return raw ? [raw] : [];
  }
}

/** סופר המרות מתוך שורות Google — לפי הפעולות שנבחרו, או הכל אם ריק */
export function countGoogleConversions(rows: GoogleRow[], selectedRaw: string): number {
  const selected = parseGoogleActions(selectedRaw);
  if (selected.length === 0) return rows.reduce((s, r) => s + r.conversions, 0);

  let total = 0;
  for (const r of rows) {
    let byAction: Record<string, number> = {};
    try {
      byAction = JSON.parse(r.conversionsByAction || "{}");
    } catch {
      byAction = {};
    }
    for (const a of selected) total += byAction[a] ?? 0;
  }
  return total;
}
