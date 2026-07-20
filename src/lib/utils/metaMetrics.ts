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
/**
 * קבוצת action types ש-Meta מדווחת עבור **אותו ליד** (ליד אתר/פיקסל/טופס) תחת שמות שונים.
 * כשנבחרים כמה מהם — הם לא מתווספים זה לזה אלא מייצגים את אותה המרה, ולכן סופרים
 * פעם אחת (המקסימום). אירועים שמחוץ לקבוצה (למשל WhatsApp/רכישה) נספרים בנפרד.
 */
// ליד מהאתר/פיקסל — אותו ליד שמטא מדווחת תחת כמה שמות
const WEBSITE_LEAD_ACTIONS = new Set([
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead",
]);
// ליד מטופס מיידי של מטא (on-Facebook) — מקור **נפרד** מליד אתר
const FORM_LEAD_ACTIONS = new Set([
  "onsite_conversion.lead_grouped",
  "onsite_conversion.leadgen_grouped",
  "offsite_conversion.lead_grouped",
  "leadgen_grouped",
  "leadgen.other",
]);
// "lead" הוא הסכום הכולל של כל סוגי הלידים — לא מתווסף לקבוצות, אלא מתחרה בהן
const AGGREGATE_LEAD_ACTION = "lead";

const LEAD_EQUIVALENT_ACTIONS = new Set([
  AGGREGATE_LEAD_ACTION,
  ...WEBSITE_LEAD_ACTIONS,
  ...FORM_LEAD_ACTIONS,
]);

export function countConversions(insights: Insight[], selectedEventRaw: string): number {
  const events = parseConversionEvents(selectedEventRaw);
  if (events.length === 0) {
    return insights.reduce((s, i) => s + i.conversions, 0);
  }

  // מפרידים לפי מקור: ליד-אתר, ליד-טופס, הסכום הכולל, ואירועים ייחודיים
  const websiteEvents = events.filter((e) => WEBSITE_LEAD_ACTIONS.has(e));
  const formEvents = events.filter((e) => FORM_LEAD_ACTIONS.has(e));
  const hasAggregate = events.includes(AGGREGATE_LEAD_ACTION);
  const distinctEvents = events.filter((e) => !LEAD_EQUIVALENT_ACTIONS.has(e));

  let total = 0;
  for (const ins of insights) {
    const actions = extractActions(ins.actionsJson);
    const valueOf = (type: string) =>
      actions.filter((a) => a.action_type === type).reduce((s, a) => s + (parseFloat(a.value) || 0), 0);

    // בתוך אותו מקור — אותו ליד בשמות שונים, סופרים פעם אחת (max).
    // בין מקורות שונים (אתר מול טופס מיידי) — מחברים, אלה לידים שונים.
    const websiteLeads = websiteEvents.length ? Math.max(...websiteEvents.map(valueOf)) : 0;
    const formLeads = formEvents.length ? Math.max(...formEvents.map(valueOf)) : 0;
    // "lead" הוא הסכום הכולל של מטא — לוקחים את הגדול מבין הסכום שחישבנו לבינו,
    // כך שהוא לא מתווסף פעמיים אך גם לא מפספס סוג ליד שלא נבחר במפורש.
    total += Math.max(hasAggregate ? valueOf(AGGREGATE_LEAD_ACTION) : 0, websiteLeads + formLeads);

    // אירועים ייחודיים (WhatsApp, הרשמה, רכישה) → מתווספים בנפרד
    for (const e of distinctEvents) total += valueOf(e);
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

// ==================== פירוק המרות לפי סוג (לווידג'ט "סוגי המרות") ====================
// סופרים רק action types ספציפיים (ערוץ-מסוים) כדי לא לספור כפול:
// מטא מדווח גם "lead" גנרי וגם onsite/offsite ספציפיים על אותם לידים.

const ACTION_LABELS: Record<string, string> = {
  "onsite_conversion.lead_grouped": "ליד — טופס בפלטפורמה",
  "offsite_conversion.fb_pixel_lead": "ליד — אתר",
  "offsite_conversion.fb_pixel_purchase": "רכישה",
  "onsite_conversion.purchase": "רכישה בפלטפורמה",
  "offsite_conversion.fb_pixel_complete_registration": "השלמת הרשמה",
  "offsite_conversion.fb_pixel_schedule": "תיאום פגישה",
  "offsite_conversion.fb_pixel_contact": "יצירת קשר",
  "offsite_conversion.fb_pixel_subscribe": "הרשמה למנוי",
  "offsite_conversion.fb_pixel_start_trial": "התחלת ניסיון",
  "offsite_conversion.fb_pixel_submit_application": "הגשת בקשה",
  "onsite_conversion.messaging_conversation_started_7d": "שיחה בהודעות",
};
const CUSTOM_PREFIX = "offsite_conversion.custom.";

export interface ActionCount {
  /** action_type הגולמי */
  type: string;
  /** תווית להצגה (עברית לאירועים סטנדרטיים; לשמות מותאמים — נפתר בנפרד) */
  label: string;
  /** מזהה ההמרה המותאמת, אם זו אחת כזאת */
  customId?: string;
  count: number;
}

/** סיכום המרות לפי סוג-אירוע מתוך actionsJson — לפירוק "סוגי המרות" בדשבורד */
export function aggregateConversionActions(insights: Array<{ actionsJson: string }>): ActionCount[] {
  const counts = new Map<string, number>();
  for (const ins of insights) {
    for (const a of extractActions(ins.actionsJson)) {
      if (ACTION_LABELS[a.action_type] || a.action_type.startsWith(CUSTOM_PREFIX)) {
        counts.set(a.action_type, (counts.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0));
      }
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([type, count]) => {
      const customId = type.startsWith(CUSTOM_PREFIX) ? type.slice(CUSTOM_PREFIX.length) : undefined;
      return { type, label: ACTION_LABELS[type] ?? `המרה מותאמת ${customId}`, customId, count };
    })
    .sort((a, b) => b.count - a.count);
}

// ==================== קטגוריזציה של ההמרות שנבחרו (לדוח השבועי) ====================
// כשהגדרת ההמרות מערבבת סוגים שונים (לידים מטופס + שיחות בהודעות וכו') —
// מפרקים לקטגוריות כדי שהדוח יציג "9 לידים · 4 שיחות" במקום "13" מטעה.

const LEAD_EVENTS = new Set(["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "leadgen.other", "offsite_conversion.fb_pixel_lead", "onsite_web_lead", "onsite_conversion.lead"]);
const MESSAGING_EVENTS = new Set(["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection", "onsite_conversion.messaging_first_reply"]);
const PURCHASE_EVENTS = new Set(["purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"]);

function categoryLabel(event: string): string {
  if (LEAD_EVENTS.has(event)) return "לידים";
  if (MESSAGING_EVENTS.has(event)) return "שיחות בהודעות";
  if (PURCHASE_EVENTS.has(event)) return "רכישות";
  return ACTION_LABELS[event] ?? "המרות אחרות";
}

/**
 * מפרק את ההמרות שנבחרו (metaConversionEvent) לקטגוריות מוצגות.
 * מחזיר [] אם אין בחירה, או קטגוריה אחת בלבד (אין צורך בהפרדה).
 */
export function categorizeSelectedConversions(insights: Insight[], selectedEventRaw: string): Array<{ label: string; count: number }> {
  const events = parseConversionEvents(selectedEventRaw);
  if (events.length === 0) return [];
  const cat = new Map<string, number>();
  for (const ins of insights) {
    const actions = extractActions(ins.actionsJson);
    for (const ev of events) {
      let cnt = 0;
      for (const a of actions) if (a.action_type === ev) cnt += parseFloat(a.value) || 0;
      if (cnt > 0) cat.set(categoryLabel(ev), (cat.get(categoryLabel(ev)) ?? 0) + cnt);
    }
  }
  return [...cat.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
