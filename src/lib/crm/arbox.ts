// קריאת CRM מ-Arbox (מערכת ניהול חוגים/מועדונים) — API ציבורי v3, הזדהות ב-apiKey.
// משמש את נינג'ה פארק/סקול. מחשב איכות לידים + המרות לחברים — **רק פניות ממומנות**
// (lead_source = "קמפיין ממומן"). הערה: לרשומות המרה/אבודות אין תאריך ב-Arbox,
// לכן ההמרות מוצגות כמצטברות (יחס המרה), ולידי-השבוע לפי created_time של הפתוחים.

const BASE = "https://arboxserver.arboxapp.com/api/public/v3/";
const PAID_SOURCE = "קמפיין ממומן";
const MAX_PAGES = 40; // גבול שפיות לעימוד

interface ArboxLead {
  lead_source?: string | null;
  lead_status?: string | null;
  lost_reason?: string | null;
  created_time?: string | null;
}

async function getAll(path: string, apiKey: string): Promise<ArboxLead[]> {
  const out: ArboxLead[] = [];
  let url: string | null = path.startsWith("http") ? path : BASE + path;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res: Response = await fetch(url, {
      headers: { apiKey, Accept: "application/json", "User-Agent": "curl/8.4.0" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Arbox ${path} ${res.status}`);
    const d: { data?: ArboxLead[]; extra?: { pagination?: { next_page_url?: string | null } } } = await res.json();
    out.push(...(d.data ?? []));
    url = d.extra?.pagination?.next_page_url ?? null;
  }
  return out;
}

export interface ArboxData {
  open: ArboxLead[];
  converted: ArboxLead[];
  lost: ArboxLead[];
}

/** שולף לידים פתוחים + שהומרו + אבודים מ-Arbox */
export async function fetchArbox(apiKey: string): Promise<ArboxData> {
  const [open, converted, lost] = await Promise.all([
    getAll("leads", apiKey),
    getAll("leads/converted", apiKey),
    getAll("leads/lost", apiKey),
  ]);
  return { open, converted, lost };
}

const isPaid = (l: ArboxLead) => (l.lead_source ?? "").includes(PAID_SOURCE);

// סיווג איכות לליד פתוח: שיעור-ניסיון (הכי חם), ללא-מענה, או בטיפול פעיל (השאר).
function openQuality(status: string): "trial" | "noAnswer" | "active" {
  const s = status || "";
  if (s.includes("אין מענה") || s.toLowerCase().includes("no answer")) return "noAnswer";
  if (s.includes("ניסיון") || s.toLowerCase().includes("trial")) return "trial";
  return "active";
}

export interface ArboxWeekly {
  hasData: boolean;
  weekOpenLeads: number; // פניות ממומנות שנכנסו בשבוע (פתוחות, לפי created_time)
  openPipeline: number; // סה"כ פניות ממומנות פתוחות כרגע
  openQuality: { trial: number; active: number; noAnswer: number };
  // מצטבר (אין תאריך המרה ב-Arbox): יחס המרה מהפניות הממומנות
  paidTotal: number;
  paidConverted: number;
}

const parseDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
};

/** מחשב מדדי Arbox ממומנים לשבוע הדוח */
export function computeArboxWeekly(data: ArboxData, weekStartStr: string, weekEndStr: string): ArboxWeekly {
  const ws = new Date(weekStartStr + "T00:00:00");
  const we = new Date(weekEndStr + "T23:59:59");
  const openPaid = data.open.filter(isPaid);
  const convertedPaid = data.converted.filter(isPaid);
  const lostPaid = data.lost.filter(isPaid);

  const week = openPaid.filter((l) => { const d = parseDate(l.created_time); return !!d && d >= ws && d <= we; });
  const q = { trial: 0, active: 0, noAnswer: 0 };
  for (const l of openPaid) q[openQuality(l.lead_status ?? "")]++;

  const paidTotal = openPaid.length + convertedPaid.length + lostPaid.length;
  return {
    hasData: paidTotal > 0,
    weekOpenLeads: week.length,
    openPipeline: openPaid.length,
    openQuality: q,
    paidTotal,
    paidConverted: convertedPaid.length,
  };
}

/** בונה טקסט Arbox לדוח (עברית) — רק פניות ממומנות */
export function buildArboxText(a: ArboxWeekly): string {
  if (!a.hasData) return "";
  const rate = a.paidTotal > 0 ? Math.round((a.paidConverted / a.paidTotal) * 100) : 0;
  const q = a.openQuality;
  return [
    "נתוני CRM (Arbox) — איכות לידים והמרות **מפרסום ממומן בלבד**:",
    `- פניות ממומנות חדשות השבוע: ${a.weekOpenLeads}. בפייפליין הממומן הפתוח כרגע: ${a.openPipeline} פניות (${q.trial} תיאמו שיעור ניסיון, ${q.active} בטיפול פעיל, ${q.noAnswer} ללא מענה).`,
    `- המרות לחברים (מצטבר, מכל הפניות הממומנות ב-CRM): ${a.paidConverted} מתוך ${a.paidTotal} — יחס המרה ${rate}%. (ל-Arbox אין תאריך המרה, לכן זהו נתון מצטבר ולא שבועי.)`,
  ].join("\n");
}
