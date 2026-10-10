// קריאת CRM מטבלת Google Sheets (ייצוא CSV ציבורי) — לכל לקוח טבלה משלו.
// מחלץ לידים (תאריך פנייה, סטטוס, מקור, סכום, קמפיין) ומחשב מדדי איכות/סגירות
// לשבוע הדוח + סגירות מתחילת החודש. גנרי: זיהוי עמודות לפי שמות-כותרת בעברית.

// מיפוי clientId → קישור טבלת CRM (Google Sheet). v1 — בהמשך יעבור ל-DB + UI
// כשנבנה חיבור CRM כללי פר-לקוח. כל לקוח מתווסף כאן בנפרד (כבקשת סער — פרטנית).
const CRM_SHEETS: Record<string, string> = {
  cmnkol7yo00079kfxa5iwtyhz: "https://docs.google.com/spreadsheets/d/1YfWN8dnXz8nqC__WIPi3COHwt06Dav2-t-dMkuq9ia8/edit", // ויברח
};
/** הקישור לטבלת ה-CRM של הלקוח, או "" אם אין */
export function crmSheetForClient(clientId: string): string {
  return CRM_SHEETS[clientId] ?? "";
}

/** בונה טקסט CRM לדוח (עברית) — איכות לידים + סגירות. **רק פניות ממומנות** (מפרסום) */
export function buildCrmText(crm: CrmWeekly): string {
  if (!crm.hasData || crm.weekLeads + crm.recentLeads === 0) return "";
  const q = crm.weekQuality;
  const parts = [
    "נתוני CRM (מטבלת הלקוח) — איכות לידים ותוצאות עסקיות **מפרסום ממומן בלבד**:",
    `- איכות הלידים הממומנים שנכנסו השבוע (${crm.weekLeads} פניות מפרסום): ${q.active} בפולואפ פעיל, ${q.dead} לא התאימו/נפלו, ${q.noAnswer} ללא מענה${q.closed > 0 ? `, ${q.closed} כבר נסגרו` : ""}.`,
    `- סגירות מפרסום ממומן ב-30 הימים האחרונים: ${crm.recentClosed} עסקאות, הכנסה ₪${crm.recentRevenue.toLocaleString("he-IL")} (כולל מע"מ), מתוך ${crm.recentLeads} פניות ממומנות שנכנסו בתקופה.`,
  ];
  return parts.join("\n");
}

/** מחלץ את ה-spreadsheet id מכתובת מלאה או מזהה גולמי */
export function sheetIdFromUrl(urlOrId: string): string {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : urlOrId.trim();
}

/** parser CSV עמיד — מטפל במרכאות, פסיקים וירידות-שורה בתוך תאים */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export interface CrmLead {
  date: Date | null;
  status: string;
  source: string;
  amount: number;
  campaign: string;
}

const HEADER = {
  date: ["תאריך פניית לקוח", "תאריך פנייה", "תאריך"],
  status: ["סטטוס"],
  source: ["דרך הגעה", "מקור", "utm_source"],
  amount: ["סכום פעילות כולל מע\"מ", "סכום", "שווי סגירה", "שווי", "עלות"],
  campaign: ["הקמפיין דרכו הגיע (אין לשנות)", "utm_campaign", "קמפיין", "הקמפיין"],
};

function findCol(headers: string[], names: string[]): number {
  for (const n of names) {
    const i = headers.findIndex((h) => h.trim() === n);
    if (i >= 0) return i;
  }
  // התאמה חלקית (מכיל)
  for (const n of names) {
    const i = headers.findIndex((h) => h.trim().includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

const HEB_MONTHS: Record<string, number> = {
  ינואר: 1, פברואר: 2, מרץ: 3, מרס: 3, אפריל: 4, מאי: 5, יוני: 6,
  יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
};
function mkDate(day: number, mon: number, y: number): Date | null {
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  if (y < 100) y += 2000;
  const dt = new Date(y, mon - 1, day);
  return isNaN(dt.getTime()) ? null : dt;
}
/**
 * מפרסר תאריך בפורמטים מעורבים: "DD/MM/YYYY" (ישראלי, ברירת מחדל), "MM/DD/YYYY"
 * (אם fmt="mdy" — כפי ש-Google ממלא אוטומטית), "D.M.YY" (נקודה = תמיד ישראלי),
 * ושם-חודש עברי "דצמבר 4, 2025".
 */
function parseDate(s: string, fmt: "dmy" | "mdy" = "dmy"): Date | null {
  const t = (s || "").trim();
  if (!t) return null;
  const hm = t.match(/^([א-ת]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (hm) { const mo = HEB_MONTHS[hm[1]]; return mo ? mkDate(parseInt(hm[2], 10), mo, parseInt(hm[3], 10)) : null; }
  const m = t.match(/^(\d{1,2})([./-])(\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[3], 10), sep = m[2];
  // "/" עם fmt=mdy → חודש/יום. נקודה/מקף תמיד ישראלי (יום.חודש).
  const [day, mon] = sep === "/" && fmt === "mdy" ? [b, a] : [a, b];
  return mkDate(day, mon, parseInt(m[4], 10));
}

function parseAmount(s: string): number {
  const n = parseFloat((s || "").replace(/[₪,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

export interface SheetOptions {
  gid?: string; // לשונית ספציפית
  headerRows?: number; // כמה שורות-כותרת (ברירת מחדל 1); הכותרת = השורה האחרונה שבהן
  dateFormat?: "dmy" | "mdy"; // פורמט תאריך ל-"/" (ברירת מחדל ישראלי dmy)
}

/** שולף ומפרסר את טבלת ה-CRM מ-Google Sheets (CSV ציבורי) */
export async function fetchCrmLeads(sheetUrlOrId: string, opts: SheetOptions = {}): Promise<CrmLead[]> {
  const id = sheetIdFromUrl(sheetUrlOrId);
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${opts.gid ? `&gid=${opts.gid}` : ""}`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`CRM sheet fetch failed: ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  const headerRows = Math.max(1, opts.headerRows ?? 1);
  if (rows.length <= headerRows) return [];
  const h = rows[headerRows - 1]; // הכותרת = השורה האחרונה מבין שורות-הכותרת (המפורטת)
  const fmt = opts.dateFormat ?? "dmy";
  const ci = {
    date: findCol(h, HEADER.date),
    status: findCol(h, HEADER.status),
    source: findCol(h, HEADER.source),
    amount: findCol(h, HEADER.amount),
    campaign: findCol(h, HEADER.campaign),
  };
  if (ci.date < 0 || ci.status < 0) return []; // טבלה לא תואמת
  const get = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i] : "");
  return rows.slice(headerRows)
    .map((r) => ({
      date: parseDate(get(r, ci.date), fmt),
      status: get(r, ci.status).trim(),
      source: get(r, ci.source).trim(),
      amount: parseAmount(get(r, ci.amount)),
      campaign: get(r, ci.campaign).trim(),
    }))
    .filter((l) => l.date !== null);
}

// ---------- סיווג סטטוסים לקטגוריות איכות ----------
const CLOSED = ["נסגר"];
const ACTIVE = ["פולואפ חם", "פולואפ", "בטיפול", "פוטנציאל"];
const DEAD = ["לא מתאים", "נפל", "יקר", "לא רלוונטי", "טעות", "כפול", "מספר שגוי", "לא מחובר"];
const NO_ANSWER = ["אין מענה"];
const AD_SOURCES = ["פייסבוק", "גוגל", "facebook", "google", "meta"];

function categorize(status: string): "closed" | "active" | "dead" | "noAnswer" | "other" {
  const s = status;
  if (CLOSED.some((x) => s.includes(x))) return "closed";
  if (NO_ANSWER.some((x) => s.includes(x))) return "noAnswer";
  if (ACTIVE.some((x) => s.includes(x))) return "active";
  if (DEAD.some((x) => s.includes(x))) return "dead";
  return "other";
}

export interface CrmWeekly {
  hasData: boolean;
  /** לידים בטבלה עם תאריך-פנייה בשבוע */
  weekLeads: number;
  weekAdLeads: number; // מקור פרסום (FB/גוגל)
  weekQuality: { closed: number; active: number; dead: number; noAnswer: number; other: number };
  /** סגירות מבין הלידים שנכנסו ב-30 הימים האחרונים (עד סוף השבוע) + הכנסה */
  recentClosed: number;
  recentRevenue: number;
  recentLeads: number;
}

const inRange = (d: Date | null, a: Date, b: Date) => !!d && d >= a && d <= b;

const isPaid = (l: CrmLead) => AD_SOURCES.some((s) => l.source.toLowerCase().includes(s));

/**
 * מחשב מדדי CRM לשבוע הדוח + סגירות ב-30 הימים האחרונים.
 * **רק פניות ממומנות** (מקור = פייסבוק/גוגל) — לפי בקשת סער, הדוח מתייחס רק לממומן.
 * פניות אורגניות/פה-לאוזן/חוזרות אינן נספרות.
 */
export function computeCrmWeekly(leads: CrmLead[], weekStartStr: string, weekEndStr: string): CrmWeekly {
  const ws = new Date(weekStartStr + "T00:00:00");
  const we = new Date(weekEndStr + "T23:59:59");
  const since30 = new Date(we.getTime() - 30 * 86400000);
  const paid = leads.filter(isPaid);

  const week = paid.filter((l) => inRange(l.date, ws, we));
  const q = { closed: 0, active: 0, dead: 0, noAnswer: 0, other: 0 };
  for (const l of week) q[categorize(l.status)]++;

  const recentArr = paid.filter((l) => inRange(l.date, since30, we));
  const recentClosedArr = recentArr.filter((l) => categorize(l.status) === "closed");
  const recentRevenue = recentClosedArr.reduce((s, l) => s + l.amount, 0);

  return {
    hasData: leads.length > 0,
    weekLeads: week.length,
    weekAdLeads: week.length, // כל הפניות שנספרות הן ממומנות
    weekQuality: q,
    recentClosed: recentClosedArr.length,
    recentRevenue: Math.round(recentRevenue),
    recentLeads: recentArr.length,
  };
}
