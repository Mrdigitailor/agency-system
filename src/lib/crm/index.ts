// נתב CRM פר-לקוח — מחבר כל לקוח למקור ה-CRM שלו (Google Sheet / Arbox / ...),
// מחשב מדדי איכות-לידים וסגירות **ממומנים בלבד**, ומחזיר טקסט לדוח השבועי.
// כל לקוח מתווסף כאן בנפרד (כבקשת סער — פרטנית); בהמשך → DB + UI.
import { fetchCrmLeads, computeCrmWeekly, buildCrmText } from "./google-sheet";
import { fetchArbox, computeArboxWeekly, buildArboxText } from "./arbox";
import { buildCrossmatchCrmText } from "./arbox-crossmatch";

import type { SheetOptions } from "./google-sheet";

type CrmConfig =
  | ({ type: "sheet"; url: string; allPaid?: boolean } & SheetOptions)
  // Arbox עם הצלבה מול טפסי-מטא (מזהה ממומן לפי טלפון/אימייל, חסין לתיוג); נופל ל-arbox רגיל אם אין META_LEADS_TOKEN
  | { type: "arbox"; keyEnv: string; pageId?: string };

// שם ה-env של טוקן ה-System-User של מטא (שליפת לידי-טפסים להצלבה). נטבע לטוקן-עמוד פר-עמוד.
const META_LEADS_TOKEN_ENV = "META_LEADS_TOKEN";

export interface CrmSourceInfo { label: string; detail: string; url: string }
/** תיאור קריא של מקור ה-CRM המחובר ללקוח (לתצוגה בסקירה הכללית). null = לא מחובר.
 *  url = קישור ישיר למקור (לחיצה פותחת אותו): הטבלה בלשונית הנכונה, או אפליקציית Arbox. */
export function crmSourceFor(clientId: string): CrmSourceInfo | null {
  const cfg = CRM_BY_CLIENT[clientId];
  if (!cfg) return null;
  if (cfg.type === "sheet") {
    const base = cfg.url.replace(/#.*$/, "");
    return { label: "Google Sheet", detail: "טבלת ניהול לידים", url: base + (cfg.gid ? `#gid=${cfg.gid}` : "") };
  }
  return { label: "Arbox", detail: cfg.pageId ? "הצלבה מול טפסי מטא" : "לפי תיוג ממומן", url: "https://arboxapp.com" };
}

const CRM_BY_CLIENT: Record<string, CrmConfig> = {
  // ויברח — Google Sheet (עדי אורה)
  cmnkol7yo00079kfxa5iwtyhz: { type: "sheet", url: "https://docs.google.com/spreadsheets/d/1YfWN8dnXz8nqC__WIPi3COHwt06Dav2-t-dMkuq9ia8/edit" },
  // נינג'ה פארק — Arbox רחובות + הצלבה מול עמוד NINJA PARK
  cmslj5xbh0000l404hh54f6sz: { type: "arbox", keyEnv: "ARBOX_KEY_NINJA_PARK", pageId: "2419223475070111" },
  // נינג'ה סקול — Arbox רשת 8 הסניפים + הצלבה מול עמוד הרשת
  cmnkol7ui00069kfxggtnkjfo: { type: "arbox", keyEnv: "ARBOX_KEY_NINJA_SCHOOL", pageId: "101098142204429" },
  // היחידה להשכרה — Google Sheet (ניהול לידים + סטטוסים); 2 שורות-כותרת, utm_source=ממומן, תאריכי MM/DD
  cmnnfaltg0001ie046piaiciq: { type: "sheet", url: "https://docs.google.com/spreadsheets/d/15waFs4WSS6xkX4LXcbCoZGB_pKSlPM927gkptoYLaCg/edit", gid: "755958179", headerRows: 2, dateFormat: "mdy" },
  // שיינה גבריאלי (שמלות כלה) — Google Sheet, לשונית "מעקב לידים". אין עמ' מקור → כל הטבלה
  // לידים מפרסום (allPaid). תאריך ISO. עמ' כפולות "סטטוס" → אינדקסים מפורשים; סטטוס=G(6),
  // רלוונטיות=H(7), שווי סגירה=I(8). **לאימות סער: כל הלידים בטבלה אכן ממומנים?**
  cmnkol82s00089kfx942xry2n: { type: "sheet", url: "https://docs.google.com/spreadsheets/d/1XVFpamGyKLw9ZhLxWtQotk7ad5PX6AnkLUFMQlV77TA/edit", sheetName: "מעקב לידים", allPaid: true, cols: { date: 0, status: 6, relevance: 7, amount: 8 } },
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
      const leads = await fetchCrmLeads(cfg.url, { gid: cfg.gid, sheetName: cfg.sheetName, headerRows: cfg.headerRows, dateFormat: cfg.dateFormat, cols: cfg.cols });
      return buildCrmText(computeCrmWeekly(leads, weekStart, weekEnd, cfg.allPaid));
    }
    if (cfg.type === "arbox") {
      const key = process.env[cfg.keyEnv];
      if (!key) { console.error(`[CRM] missing env ${cfg.keyEnv} for client ${clientId}`); return ""; }
      const metaToken = process.env[META_LEADS_TOKEN_ENV];
      // אם יש עמוד-מטא + טוקן — הצלבה מדויקת (זיהוי ממומן לפי מי הליד); אחרת Arbox לפי תיוג
      if (cfg.pageId && metaToken) {
        try {
          const txt = await buildCrossmatchCrmText({ pageId: cfg.pageId, arboxKey: key, metaToken }, weekStart, weekEnd);
          if (txt) return txt;
        } catch (e) {
          console.error("[CRM] crossmatch failed, falling back to arbox tag for", clientId, e instanceof Error ? e.message : e);
        }
      }
      const data = await fetchArbox(key);
      return buildArboxText(computeArboxWeekly(data, weekStart, weekEnd));
    }
  } catch (e) {
    console.error("[CRM] build failed for", clientId, e instanceof Error ? e.message : e);
  }
  return "";
}
