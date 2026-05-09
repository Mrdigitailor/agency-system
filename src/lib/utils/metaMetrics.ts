// Helpers לחישוב metrics מ-Meta insights

interface Insight {
  spend: number;
  conversions: number;
  purchases: number;
  leads: number;
  actionsJson: string;
}

/**
 * פיענוח metaConversionEvent — יכול להיות string בודד או JSON array
 */
export function parseConversionEvents(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === "string" && s);
    return [];
  } catch {
    // backward compat — string בודד (לא JSON)
    return [raw];
  }
}

/**
 * חלץ actions מ-actionsJson — מנרמל מבנים שונים
 */
function extractActions(actionsJson: string): Array<{ action_type: string; value: string }> {
  if (!actionsJson) return [];
  try {
    const parsed = JSON.parse(actionsJson);
    // actionsJson = JSON.stringify(ins) — כל ה-insight object מ-Meta API
    // ל-insight יש שדה actions שהוא מערך
    if (parsed.actions && Array.isArray(parsed.actions)) return parsed.actions;
    // fallback — אם השדה עצמו הוא מערך
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

/**
 * חישוב conversions לפי event types שנבחרו (תומך במערך)
 * אם selectedEvents ריק — מחזיר conversions כללי מהשדה conversions
 *
 * חשוב: כל הספירה עוברת דרך actionsJson כדי למנוע כפילויות.
 * לא משתמשים ב-shortcuts של i.leads / i.purchases כי:
 * - שדה leads ב-DB = getActionValue(["lead"]) שזה סיכום כללי
 * - המשתמש יכול לבחור events ספציפיים כמו offsite_conversion.fb_pixel_lead
 *   + onsite_conversion.lead_grouped — ואם נשתמש ב-i.leads זה ייצור כפילות
 */
export function countConversions(insights: Insight[], selectedEventRaw: string): number {
  const events = parseConversionEvents(selectedEventRaw);
  if (events.length === 0) {
    return insights.reduce((s, i) => s + i.conversions, 0);
  }

  let total = 0;
  for (const ins of insights) {
    const actions = extractActions(ins.actionsJson);
    for (const event of events) {
      for (const a of actions) {
        if (a.action_type === event) {
          total += parseFloat(a.value) || 0;
        }
      }
    }
  }
  return total;
}

/**
 * פירוט המרות לפי סוג — לtooltip / debug
 */
export function breakdownConversions(insights: Insight[], selectedEventRaw: string): Array<{ event: string; count: number }> {
  const events = parseConversionEvents(selectedEventRaw);
  if (events.length === 0) return [{ event: "all", count: insights.reduce((s, i) => s + i.conversions, 0) }];

  return events.map((event) => {
    let count = 0;
    for (const ins of insights) {
      const actions = extractActions(ins.actionsJson);
      for (const a of actions) {
        if (a.action_type === event) {
          count += parseFloat(a.value) || 0;
        }
      }
    }
    return { event, count };
  });
}
