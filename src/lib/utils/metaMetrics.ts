// Helpers לחישוב metrics מ-Meta insights

interface Insight {
  spend: number;
  conversions: number;
  purchases: number;
  leads: number;
  actionsJson: string;
}

/**
 * חישוב conversions לפי event type שנבחר
 * אם selectedEvent ריק — מחזיר את שדה conversions של ה-DB
 */
export function countConversions(insights: Insight[], selectedEvent: string): number {
  if (!selectedEvent) {
    return insights.reduce((s, i) => s + i.conversions, 0);
  }
  if (selectedEvent === "purchase" || selectedEvent === "offsite_conversion.fb_pixel_purchase") {
    return insights.reduce((s, i) => s + i.purchases, 0);
  }
  if (selectedEvent === "lead" || selectedEvent === "offsite_conversion.fb_pixel_lead") {
    return insights.reduce((s, i) => s + i.leads, 0);
  }
  // Custom — חלץ מ-actionsJson
  let sum = 0;
  for (const ins of insights) {
    try {
      const parsed = JSON.parse(ins.actionsJson ?? "{}") as { actions?: Array<{ action_type: string; value: string }> };
      if (parsed.actions) {
        for (const a of parsed.actions) {
          if (a.action_type === selectedEvent) sum += parseFloat(a.value) || 0;
        }
      }
    } catch {}
  }
  return sum;
}
