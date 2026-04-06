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
 * חישוב conversions לפי event types שנבחרו (תומך במערך)
 * אם selectedEvents ריק — מחזיר conversions כללי
 */
export function countConversions(insights: Insight[], selectedEventRaw: string): number {
  const events = parseConversionEvents(selectedEventRaw);
  if (events.length === 0) {
    return insights.reduce((s, i) => s + i.conversions, 0);
  }

  let total = 0;
  for (const event of events) {
    if (event === "purchase" || event === "offsite_conversion.fb_pixel_purchase") {
      total += insights.reduce((s, i) => s + i.purchases, 0);
    } else if (event === "lead" || event === "offsite_conversion.fb_pixel_lead") {
      total += insights.reduce((s, i) => s + i.leads, 0);
    } else {
      // Custom/other — חלץ מ-actionsJson
      for (const ins of insights) {
        try {
          const parsed = JSON.parse(ins.actionsJson ?? "{}") as { actions?: Array<{ action_type: string; value: string }> };
          if (parsed.actions) {
            for (const a of parsed.actions) {
              if (a.action_type === event) total += parseFloat(a.value) || 0;
            }
          }
        } catch {}
      }
    }
  }
  return total;
}

/**
 * פירוט המרות לפי סוג — לtooltip
 */
export function breakdownConversions(insights: Insight[], selectedEventRaw: string): Array<{ event: string; count: number }> {
  const events = parseConversionEvents(selectedEventRaw);
  if (events.length === 0) return [{ event: "all", count: insights.reduce((s, i) => s + i.conversions, 0) }];

  return events.map((event) => {
    let count = 0;
    if (event === "purchase" || event === "offsite_conversion.fb_pixel_purchase") {
      count = insights.reduce((s, i) => s + i.purchases, 0);
    } else if (event === "lead" || event === "offsite_conversion.fb_pixel_lead") {
      count = insights.reduce((s, i) => s + i.leads, 0);
    } else {
      for (const ins of insights) {
        try {
          const parsed = JSON.parse(ins.actionsJson ?? "{}") as { actions?: Array<{ action_type: string; value: string }> };
          if (parsed.actions) {
            for (const a of parsed.actions) {
              if (a.action_type === event) count += parseFloat(a.value) || 0;
            }
          }
        } catch {}
      }
    }
    return { event, count };
  });
}
