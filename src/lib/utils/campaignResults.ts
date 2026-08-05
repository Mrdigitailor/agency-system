// ספירת המרות פר-קמפיין לפי ה-Result שלו — כמו עמודת "Results" של מטא.
// במקום לסכום סוג-אירוע על כל החשבון (שמנפח), סופרים לכל קמפיין רק את
// ההמרה שאליה הוא עושה אופטימיזציה, לפי ה-objective + הנתונים בפועל.
// קמפיינים שסומנו ידנית כ"לא-למכירה" (גיוס) — לא נספרים.

interface MetaRow { name: string; externalId: string; purchases: number; actionsJson: string }

// action types לכל קטגוריית תוצאה
const LEAD_ACTION = "lead"; // הסכום הכולל של מטא ללידים (= ה-Result לקמפייני לידים)
const FORM_LEAD_ACTIONS = ["onsite_conversion.lead_grouped", "onsite_conversion.leadgen_grouped"];
const WEB_LEAD_ACTIONS = ["offsite_conversion.fb_pixel_lead", "onsite_web_lead"];
const REG_ACTIONS = ["offsite_conversion.fb_pixel_complete_registration", "onsite_conversion.complete_registration"];
const MSG_ACTIONS = ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"];

export type CampaignResultType = "purchases" | "leads" | "registrations" | "messages" | "conversions" | "none";

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
const sumActions = (acts: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + (acts[k] ?? 0), 0);

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
  // "lead" אגרגטיבי אם קיים, אחרת הגבוה מבין טופס/אתר (מונע ספירה כפולה)
  const leads = acts[LEAD_ACTION] ?? Math.max(sumActions(acts, FORM_LEAD_ACTIONS), sumActions(acts, WEB_LEAD_ACTIONS));
  const registrations = sumActions(acts, REG_ACTIONS);
  const messages = sumActions(acts, MSG_ACTIONS);

  // מכירות → רכישות
  if (objective.includes("SALES") || objective.includes("PURCHASE")) {
    if (purchases > 0) return { resultType: "purchases", count: Math.round(purchases) };
  }
  // מעורבות/הודעות — לא נספר כהמרת-מכירה, אלא אם זו שיחה בהודעות
  if (objective.includes("ENGAGEMENT") || objective.includes("AWARENESS") || objective.includes("TRAFFIC")) {
    return messages > 0 ? { resultType: "messages", count: Math.round(messages) } : { resultType: "none", count: 0 };
  }
  // לידים (וברירת מחדל): לידים; ואם הקמפיין בפועל מייצר הרשמות ולא לידים — הרשמות
  if (leads > 0) return { resultType: "leads", count: Math.round(leads) };
  if (registrations > 0) return { resultType: "registrations", count: Math.round(registrations) };
  if (messages > 0) return { resultType: "messages", count: Math.round(messages) };
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
    const { resultType, count } = classifyOne(rs);
    const isExcluded = excluded.has(id);
    perCampaign.push({ campaignId: id, campaignName: rs[0].name || "(ללא שם)", platform: "meta", resultType, count, excluded: isExcluded });
    if (!isExcluded) total += count;
  }
  perCampaign.sort((a, b) => b.count - a.count);
  return { total, perCampaign };
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
