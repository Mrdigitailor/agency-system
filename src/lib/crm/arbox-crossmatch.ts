// הצלבת לידי-טפסים של מטא מול Arbox — מזהה פניות **ממומנות** לפי מי הן (טלפון/אימייל
// שהגיעו מטופס-ליד ממומן במטא = מקור-אמת לממומן), חסין לבריחות-תיוג של lead_source ב-Arbox.
// בנוסף נותן תאריך-המרה שבועי: תאריך הליד במטא עוגן את השבוע (ל-Arbox אין תאריך המרה).
//
// המסלול היעיל: page -> leadgen_forms -> לכל טופס /leads מסונן בתאריך. טוקן-עמוד נטבע
// מתוך טוקן ה-System-User (META_LEADS_TOKEN). הצלבה מול leads/converted/lost של Arbox.

import { fetchArbox, type ArboxData, type ArboxLead } from "./arbox";

const G = "https://graph.facebook.com/v21.0";
const MAX_FORMS = 120;

function normPhone(p?: string | null): string {
  let d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return d.slice(-9);
}
const normEmail = (e?: string | null) => (e ?? "").trim().toLowerCase();

async function fbGet<T = Record<string, unknown>>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${G}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  const json = await res.json();
  if (json.error) throw new Error(`Meta ${path}: ${json.error.message}`);
  return json as T;
}

/** טביעת טוקן-עמוד מתוך טוקן ה-System-User */
async function mintPageToken(pageId: string, userToken: string): Promise<string> {
  const d = await fbGet<{ access_token?: string }>(pageId, { fields: "access_token", access_token: userToken });
  if (!d.access_token) throw new Error(`no page token for ${pageId}`);
  return d.access_token;
}

export interface MetaLead { created: Date; phone: string; email: string; formId: string }

/** שולף לידי-טפסים של מטא מעמוד נתון מאז תאריך (UNIX שניות) */
export async function fetchMetaLeads(pageId: string, userToken: string, sinceUnix: number): Promise<MetaLead[]> {
  const pageToken = await mintPageToken(pageId, userToken);
  // רשימת הטפסים (עם עימוד)
  const forms: Array<{ id: string; leads_count?: number }> = [];
  let url: string | null = `${G}/${pageId}/leadgen_forms?${new URLSearchParams({ fields: "id,leads_count", limit: "100", access_token: pageToken })}`;
  for (let i = 0; i < 5 && url && forms.length < MAX_FORMS; i++) {
    const d: { data?: Array<{ id: string; leads_count?: number }>; paging?: { next?: string } } = await fbGet(url, {});
    forms.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
  }
  const active = forms.filter((f) => (f.leads_count ?? 0) > 0);
  const filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]);
  const out: MetaLead[] = [];
  // סדרתי כדי לא להציף את ה-API (מעט עשרות טפסים). טופס בודד שנכשל לא מפיל את הכל.
  for (const f of active) {
    try {
      let furl: string | null = `${G}/${f.id}/leads?${new URLSearchParams({ fields: "id,created_time,field_data", limit: "500", filtering, access_token: pageToken })}`;
      for (let i = 0; i < 10 && furl; i++) {
        const d: { data?: Array<{ created_time: string; field_data?: Array<{ name: string; values?: string[] }> }>; paging?: { next?: string } } = await fbGet(furl, {});
        for (const r of d.data ?? []) {
          const fd: Record<string, string> = {};
          for (const x of r.field_data ?? []) fd[x.name] = x.values?.[0] ?? "";
          out.push({ created: new Date(r.created_time), phone: normPhone(fd.phone_number || fd.phone), email: normEmail(fd.email), formId: f.id });
        }
        furl = d.paging?.next ?? null;
      }
    } catch (e) {
      console.error(`[crossmatch] form ${f.id} leads failed:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// ===== הצלבה מול Arbox =====
type MatchKind = "member" | "trial" | "active" | "noAnswer" | "lost" | "notFound";
const TRIAL = ["תואם שיעור ניסיון", "היו בניסיון"];
const NOANS = ["אין מענה"];

function buildIndex(data: ArboxData) {
  const byPhone = new Map<string, Array<{ kind: "converted" | "open" | "lost"; r: ArboxLead }>>();
  const byEmail = new Map<string, Array<{ kind: "converted" | "open" | "lost"; r: ArboxLead }>>();
  const add = (kind: "converted" | "open" | "lost", rows: ArboxLead[]) => {
    for (const r of rows) {
      const p = normPhone(r.phone); const e = normEmail(r.email);
      if (p) (byPhone.get(p) ?? byPhone.set(p, []).get(p)!).push({ kind, r });
      if (e) (byEmail.get(e) ?? byEmail.set(e, []).get(e)!).push({ kind, r });
    }
  };
  add("converted", data.converted);
  add("open", data.open);
  add("lost", data.lost);
  return { byPhone, byEmail };
}

const ORDER = { converted: 0, open: 1, lost: 2 } as const;

function classify(lead: MetaLead, idx: ReturnType<typeof buildIndex>): MatchKind {
  const hits = (lead.phone && idx.byPhone.get(lead.phone)) || (lead.email && idx.byEmail.get(lead.email)) || [];
  if (!hits.length) return "notFound";
  const best = [...hits].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])[0];
  if (best.kind === "converted") return "member";
  if (best.kind === "lost") {
    // "נרשם לחוג-לקוח כפול" = בעצם חבר
    if ((best.r.lost_reason ?? "").includes("נרשם לחוג")) return "member";
    return "lost";
  }
  const st = best.r.lead_status ?? "";
  if (NOANS.some((x) => st.includes(x))) return "noAnswer";
  if (TRIAL.some((x) => st.includes(x))) return "trial";
  return "active";
}

export interface CrossmatchWeekly {
  hasData: boolean;
  weekLeads: number; // פניות ממומנות שנכנסו בשבוע (מקור-אמת: טפסי מטא)
  week: Record<MatchKind, number>; // תוצאת כל ליד-שבוע ב-Arbox כרגע
  recentLeads: number; // 30 יום אחרונים
  recentMembers: number; // מתוכם שהפכו לחברים
}

function emptyCounts(): Record<MatchKind, number> {
  return { member: 0, trial: 0, active: 0, noAnswer: 0, lost: 0, notFound: 0 };
}

export function computeCrossmatchWeekly(metaLeads: MetaLead[], data: ArboxData, weekStartStr: string, weekEndStr: string): CrossmatchWeekly {
  const idx = buildIndex(data);
  const ws = new Date(weekStartStr + "T00:00:00Z");
  const we = new Date(weekEndStr + "T23:59:59Z");
  const recentFrom = new Date(we.getTime() - 30 * 86400_000);

  const week = emptyCounts();
  let weekLeads = 0, recentLeads = 0, recentMembers = 0;
  for (const l of metaLeads) {
    const k = classify(l, idx);
    if (l.created >= ws && l.created <= we) { weekLeads++; week[k]++; }
    if (l.created >= recentFrom && l.created <= we) { recentLeads++; if (k === "member") recentMembers++; }
  }
  return { hasData: metaLeads.length > 0, weekLeads, week, recentLeads, recentMembers };
}

export function buildCrossmatchText(c: CrossmatchWeekly): string {
  if (!c.hasData) return "";
  const w = c.week;
  const openNow = w.trial + w.active + w.noAnswer;
  const rate = c.recentLeads > 0 ? Math.round((c.recentMembers / c.recentLeads) * 100) : 0;
  return [
    "נתוני CRM (Arbox, בהצלבה מול טפסי-הלידים של מטא) — **פניות ממומנות בלבד, מזוהות לפי טלפון/אימייל** (חסין לתיוג חלקי):",
    `- פניות ממומנות שנכנסו השבוע: ${c.weekLeads}. מתוכן ב-Arbox כרגע: ${w.member} כבר נרשמו כחברים, ${w.trial} תיאמו שיעור ניסיון, ${w.active} בטיפול פעיל, ${w.noAnswer} ללא מענה, ${w.lost} נסגרו כלא-רלוונטי${w.notFound ? `, ${w.notFound} עדיין לא נמצאות ב-CRM` : ""}.`,
    `- בשלות המרה (30 יום אחרונים): ${c.recentMembers} נרשמו כחברים מתוך ${c.recentLeads} פניות ממומנות — יחס המרה ${rate}%.`,
    openNow > 0 ? `- ${openNow} פניות ממומנות מהשבוע עדיין פתוחות לטיפול.` : "",
  ].filter(Boolean).join("\n");
}

/** נקודת-כניסה: שולף מטא+Arbox, מצליב, ומחזיר בלוק טקסט לדוח */
export async function buildCrossmatchCrmText(opts: { pageId: string; arboxKey: string; metaToken: string }, weekStart: string, weekEnd: string): Promise<string> {
  const since = Math.floor(new Date(weekEnd + "T23:59:59Z").getTime() / 1000) - 35 * 86400; // חלון 35 יום לכיסוי השבוע + בשלות 30 יום
  const [metaLeads, arbox] = await Promise.all([
    fetchMetaLeads(opts.pageId, opts.metaToken, since),
    fetchArbox(opts.arboxKey),
  ]);
  return buildCrossmatchText(computeCrossmatchWeekly(metaLeads, arbox, weekStart, weekEnd));
}
