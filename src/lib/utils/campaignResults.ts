// ספירת המרות פר-קמפיין לפי ה-Result שלו — כמו עמודת "Results" של מטא.
// במקום לסכום סוג-אירוע על כל החשבון (שמנפח), סופרים לכל קמפיין רק את
// ההמרה שאליה הוא עושה אופטימיזציה, לפי ה-objective + הנתונים בפועל.
// קמפיינים שסומנו ידנית כ"לא-למכירה" (גיוס) — לא נספרים.

interface MetaRow { name: string; externalId: string; purchases: number; actionsJson: string }

// action types לכל קטגוריית תוצאה
const FORM_LEAD_ACTIONS = ["onsite_conversion.lead_grouped", "onsite_conversion.leadgen_grouped"];
const WEB_LEAD_ACTIONS = ["offsite_conversion.fb_pixel_lead", "onsite_web_lead"];
const REG_ACTIONS = ["offsite_conversion.fb_pixel_complete_registration", "onsite_conversion.complete_registration"];
// "שיחות שנפתחו" = מה שמטא מציגה כתוצאה (Results) לקמפייני הודעות. "חיבורי הודעות"
// (total_messaging_connection) רחב יותר ומנפח — משמש רק כ-fallback אם אין את הראשון.
const MSG_STARTED = ["onsite_conversion.messaging_conversation_started_7d"];
const MSG_FALLBACK = ["onsite_conversion.total_messaging_connection"];

export type CampaignResultType = "purchases" | "leads" | "registrations" | "messages" | "conversions" | "none";

// ממפה אירוע-המרה שנבחר (metaConversionEvent) לסוג-תוצאה. משמש כדי לספור רק את
// סוגי-התוצאה שהלקוח בחר — לדוגמה לקוח שבחר "רכישה" לא יראה שיחות/לידים כהמרות.
function eventToResultType(event: string): CampaignResultType | null {
  const s = event.toLowerCase();
  if (s.includes("purchase")) return "purchases";
  if (s.includes("registration") || s.includes("signup") || s.includes("sign_up") || s.includes("subscribe")) return "registrations";
  if (s.includes("messaging") || s.includes("conversation") || s.includes("message")) return "messages";
  if (s.includes("lead")) return "leads";
  return null; // אירוע לא מוכר — לא מגביל
}
/** פרסור metaConversionEvent (JSON array של שמות אירועים) למערך מחרוזות */
export function parseMetaEvents(raw: string | null | undefined): string[] {
  try { const p = JSON.parse(raw || "[]"); return Array.isArray(p) ? p.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}
/** אוסף סוגי-התוצאה שהלקוח בחר לספור. ריק = בלי הגבלה (סופרים את כל הסוגים). */
function selectedResultTypes(selectedEvents: string[]): Set<CampaignResultType> {
  const set = new Set<CampaignResultType>();
  for (const e of selectedEvents) { const t = eventToResultType(e); if (t) set.add(t); }
  return set;
}

export interface CampaignResult {
  campaignId: string;
  campaignName: string;
  platform: "meta" | "google" | "tiktok";
  resultType: CampaignResultType;
  count: number;
  excluded: boolean;
}

function actionsOf(json: string): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    for (const a of JSON.parse(json).actions ?? []) out[a.action_type] = (out[a.action_type] ?? 0) + (parseFloat(a.value) || 0);
  } catch { /* skip */ }
  return out;
}
function objectiveOf(json: string): string {
  try { return String(JSON.parse(json).objective ?? "").toUpperCase(); } catch { return ""; }
}
// מקס בתוך קטגוריה — מטא מדווחת את אותה המרה תחת כמה action_type (לדוגמה
// onsite_web_lead ו-offsite_conversion.fb_pixel_lead = אותם לידים). סכום היה מנפח פי-2;
// מקסימום מחזיר את הספירה האמיתית של האירוע.
const maxActions = (acts: Record<string, number>, keys: string[]) => keys.reduce((m, k) => Math.max(m, acts[k] ?? 0), 0);

// האם האירוע הוא המרה מותאמת-אישית (בשמה) — אלה לא ניתנות לזיהוי ע"י classifyOne
// (שמכיר רק action_types סטנדרטיים), ולכן נספרות ישירות מהבחירה של הלקוח.
const isCustomConv = (e: string) => e.includes(".custom.") || e.includes("fb_pixel_custom");

// אגרגציה של ערכי האירועים מ-actions ומ-conversions (ההמרות המותאמות בשמן נמצאות רק
// ב-conversions). בתוך יום בודד: max בין actions ל-conversions לאותו action_type (שניהם
// מתארים את אותה המרה — לא לכפול); בין ימים: סכום.
function aggActsAndConvs(rows: MetaRow[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const r of rows) {
    let o: { actions?: Array<{ action_type: string; value: string }>; conversions?: Array<{ action_type: string; value: string }> } = {};
    try { o = JSON.parse(r.actionsJson); } catch { /* skip */ }
    const row: Record<string, number> = {};
    for (const a of o.actions ?? []) row[a.action_type] = Math.max(row[a.action_type] ?? 0, parseFloat(a.value) || 0);
    for (const c of o.conversions ?? []) row[c.action_type] = Math.max(row[c.action_type] ?? 0, parseFloat(c.value) || 0);
    for (const [k, v] of Object.entries(row)) total[k] = (total[k] ?? 0) + v;
  }
  return total;
}

/**
 * סיווג קמפיין תוך כיבוד בחירת-האירועים של הלקוח. ברירת המחדל = classifyOne (ללא שינוי).
 * חריג: אם הלקוח בחר המרה מותאמת-אישית (LeadCustom וכו') — סופרים אותה ישירות מ-conversions,
 * כי זה ה-Result של הקמפיין ב-Meta ו-classifyOne לא מכיר אותה. העדיפות ל-max כדי לא לכפול.
 */
function classifyCampaign(rows: MetaRow[], selectedEvents: string[]): { resultType: CampaignResultType; count: number } {
  const cls = classifyOne(rows);
  if (selectedEvents.length === 0) return cls;
  const selectedTypes = selectedResultTypes(selectedEvents);
  const filteredCount = selectedTypes.size > 0 && !selectedTypes.has(cls.resultType) ? 0 : cls.count;
  const custom = selectedEvents.filter(isCustomConv);
  if (custom.length > 0) {
    const acts = aggActsAndConvs(rows);
    const winner = custom.reduce((a, b) => ((acts[b] ?? 0) > (acts[a] ?? 0) ? b : a), custom[0]);
    const ex = Math.round(acts[winner] ?? 0);
    if (ex > filteredCount) return { resultType: eventToResultType(winner) ?? "conversions", count: ex };
  }
  return { resultType: cls.resultType, count: filteredCount };
}

/** התוצאה של קמפיין בודד — הסוג והכמות שאליהם הוא עושה אופטימיזציה */
function classifyOne(rows: MetaRow[]): { resultType: CampaignResultType; count: number } {
  let objective = "";
  const acts: Record<string, number> = {};
  let purchases = 0;
  for (const r of rows) {
    if (!objective) objective = objectiveOf(r.actionsJson);
    purchases += r.purchases;
    const a = actionsOf(r.actionsJson);
    for (const [k, v] of Object.entries(a)) acts[k] = (acts[k] ?? 0) + v;
  }
  // הליד הדומיננטי — הגבוה מבין טופס (lead_grouped) לאתר (fb_pixel_lead). לא סכום
  // ולא ה-"lead" האגרגטיבי (שכולל את שניהם) — כדי לספור את אירוע-התוצאה המדויק
  // שמטא מציגה בעמודת Results (Leads Form / Website Leads), בלי ניפוח.
  const leads = Math.max(maxActions(acts, FORM_LEAD_ACTIONS), maxActions(acts, WEB_LEAD_ACTIONS));
  const registrations = maxActions(acts, REG_ACTIONS);
  const started = maxActions(acts, MSG_STARTED);
  const messages = started > 0 ? started : maxActions(acts, MSG_FALLBACK);

  // מכירות → רכישות
  if (objective.includes("SALES") || objective.includes("PURCHASE")) {
    if (purchases > 0) return { resultType: "purchases", count: Math.round(purchases) };
  }
  // מעורבות/הודעות — לא נספר כהמרת-מכירה, אלא אם זו שיחה בהודעות
  if (objective.includes("ENGAGEMENT") || objective.includes("AWARENESS") || objective.includes("TRAFFIC")) {
    return messages > 0 ? { resultType: "messages", count: Math.round(messages) } : { resultType: "none", count: 0 };
  }
  // לידים (וברירת מחדל): התוצאה היא הליד הדומיננטי של הקמפיין. אירוע אחר (הרשמה/
  // הודעה) נחשב לתוצאת-הקמפיין רק אם אין לידים ממשיים, או אם הוא מכריע בבירור על
  // הלידים (פי 2+) — כלומר הקמפיין ממוקד בו. כך קמפיין-הרשמות עם ליד מקרי בודד
  // נספר כהרשמותיו המלאות, וקמפיין-לידים לא מנופח ע"י אירועים משניים.
  if (leads > 0 && registrations <= leads * 2 && messages <= leads * 2) {
    return { resultType: "leads", count: Math.round(leads) };
  }
  const opts: Array<{ t: CampaignResultType; n: number }> = [
    { t: "leads", n: leads },
    { t: "registrations", n: registrations },
    { t: "messages", n: messages },
  ];
  const best = opts.reduce((a, b) => (b.n > a.n ? b : a));
  if (best.n > 0) return { resultType: best.t, count: Math.round(best.n) };
  if (purchases > 0) return { resultType: "purchases", count: Math.round(purchases) };
  return { resultType: "none", count: 0 };
}

/**
 * סופר המרות פר-קמפיין (מטא) לפי ה-Result של כל קמפיין, מחריג קמפיינים שסומנו.
 * מחזיר את הפירוק + הסך.
 */
export function countMetaCampaignResults(
  rows: MetaRow[],
  excludedCampaignIds: string[] = [],
  selectedEvents: string[] = [],
): { total: number; perCampaign: CampaignResult[] } {
  const excluded = new Set(excludedCampaignIds);
  const groups = new Map<string, MetaRow[]>();
  for (const r of rows) {
    const key = r.externalId || r.name;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const perCampaign: CampaignResult[] = [];
  let total = 0;
  for (const [id, rs] of groups) {
    // classifyCampaign מכבד את בחירת-האירועים (כולל המרות מותאמות-אישית כמו LeadCustom)
    const { resultType, count } = classifyCampaign(rs, selectedEvents);
    const isExcluded = excluded.has(id);
    perCampaign.push({ campaignId: id, campaignName: rs[0].name || "(ללא שם)", platform: "meta", resultType, count, excluded: isExcluded });
    if (!isExcluded) total += count;
  }
  perCampaign.sort((a, b) => b.count - a.count);
  return { total, perCampaign };
}

/**
 * תוצאת קמפיין מטא בודד (סוג + כמות) לפי ה-Result שלו — לשימוש בדוח השבועי כדי
 * שיהיה עקבי עם הסקירה (max בקטגוריה, בלי ניפוח מסכום-אירועים, מכבד בחירת סוג).
 */
export function campaignResultCount(rows: MetaRow[], selectedEvents: string[] = []): { resultType: CampaignResultType; count: number } {
  return classifyCampaign(rows, selectedEvents);
}

// ==================== Google + TikTok — ספירה פר-קמפיין ====================
// אצל גוגל/טיקטוק ה-"conversions" של הקמפיין הוא כבר ה-Result שלו (הפלטפורמה
// מייחסת המרות פר-קמפיין). אין objective כמו במטא, אז סוג התוצאה = "המרות".

interface GoogleRow { campaignId: string; campaignName: string; conversions: number; conversionsByAction: string }
interface TiktokRow { campaignId: string; campaignName: string; conversions: number }

/** סופר המרות Google פר-קמפיין (לפי הפעולות שנבחרו), מחריג קמפיינים שסומנו */
export function countGoogleCampaignResults(
  rows: GoogleRow[],
  selectedActions: string[],
  excludedCampaignIds: string[] = [],
): { total: number; perCampaign: CampaignResult[] } {
  const excluded = new Set(excludedCampaignIds);
  const useSelected = selectedActions.length > 0;
  const groups = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const id = r.campaignId || r.campaignName;
    const e = groups.get(id) ?? { name: r.campaignName || "(ללא שם)", count: 0 };
    if (useSelected) {
      let byAction: Record<string, number> = {};
      try { byAction = JSON.parse(r.conversionsByAction || "{}"); } catch { byAction = {}; }
      for (const a of selectedActions) e.count += byAction[a] ?? 0;
    } else {
      e.count += r.conversions;
    }
    groups.set(id, e);
  }
  const perCampaign: CampaignResult[] = [];
  let total = 0;
  for (const [id, g] of groups) {
    const isExcluded = excluded.has(id);
    const count = Math.round(g.count);
    perCampaign.push({ campaignId: id, campaignName: g.name, platform: "google", resultType: "conversions", count, excluded: isExcluded });
    if (!isExcluded) total += count;
  }
  perCampaign.sort((a, b) => b.count - a.count);
  return { total, perCampaign };
}

/** סופר המרות TikTok פר-קמפיין, מחריג קמפיינים שסומנו */
export function countTiktokCampaignResults(
  rows: TiktokRow[],
  excludedCampaignIds: string[] = [],
): { total: number; perCampaign: CampaignResult[] } {
  const excluded = new Set(excludedCampaignIds);
  const groups = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    const id = r.campaignId || r.campaignName;
    const e = groups.get(id) ?? { name: r.campaignName || "(ללא שם)", count: 0 };
    e.count += r.conversions;
    groups.set(id, e);
  }
  const perCampaign: CampaignResult[] = [];
  let total = 0;
  for (const [id, g] of groups) {
    const isExcluded = excluded.has(id);
    const count = Math.round(g.count);
    perCampaign.push({ campaignId: id, campaignName: g.name, platform: "tiktok", resultType: "conversions", count, excluded: isExcluded });
    if (!isExcluded) total += count;
  }
  perCampaign.sort((a, b) => b.count - a.count);
  return { total, perCampaign };
}
