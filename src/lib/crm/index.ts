// נתב CRM פר-לקוח — מחבר כל לקוח למקור ה-CRM שלו (Google Sheet / Arbox / ...),
// מחשב מדדי איכות-לידים וסגירות **ממומנים בלבד**, ומחזיר טקסט לדוח השבועי.
// כל לקוח מתווסף כאן בנפרד (כבקשת סער — פרטנית); בהמשך → DB + UI.
import { fetchCrmLeads, computeCrmWeekly, buildCrmText } from "./google-sheet";
import { fetchArbox, computeArboxWeekly, buildArboxText } from "./arbox";

type CrmConfig =
  | { type: "sheet"; url: string }
  | { type: "arbox"; keyEnv: string };

const CRM_BY_CLIENT: Record<string, CrmConfig> = {
  // ויברח — Google Sheet (עדי אורה)
  cmnkol7yo00079kfxa5iwtyhz: { type: "sheet", url: "https://docs.google.com/spreadsheets/d/1YfWN8dnXz8nqC__WIPi3COHwt06Dav2-t-dMkuq9ia8/edit" },
  // נינג'ה פארק — Arbox רחובות (נינג'ה סקול רחובות + מכבי רחובות)
  cmslj5xbh0000l404hh54f6sz: { type: "arbox", keyEnv: "ARBOX_KEY_NINJA_PARK" },
  // נינג'ה סקול — Arbox רשת 8 הסניפים (חוץ מרחובות)
  cmnkol7ui00069kfxggtnkjfo: { type: "arbox", keyEnv: "ARBOX_KEY_NINJA_SCHOOL" },
};

/**
 * בונה את בלוק ה-CRM לדוח השבועי של הלקוח (איכות לידים + סגירות, ממומן בלבד).
 * מחזיר "" אם אין CRM מחובר, או אם השליפה נכשלה (לא חוסם את הדוח).
 */
export async function buildClientCrmText(clientId: string, weekStart: string, weekEnd: string): Promise<string> {
  const cfg = CRM_BY_CLIENT[clientId];
  if (!cfg) return "";
  try {
    if (cfg.type === "sheet") {
      const leads = await fetchCrmLeads(cfg.url);
      return buildCrmText(computeCrmWeekly(leads, weekStart, weekEnd));
    }
    if (cfg.type === "arbox") {
      const key = process.env[cfg.keyEnv];
      if (!key) { console.error(`[CRM] missing env ${cfg.keyEnv} for client ${clientId}`); return ""; }
      const data = await fetchArbox(key);
      return buildArboxText(computeArboxWeekly(data, weekStart, weekEnd));
    }
  } catch (e) {
    console.error("[CRM] build failed for", clientId, e instanceof Error ? e.message : e);
  }
  return "";
}
