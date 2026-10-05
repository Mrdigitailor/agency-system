// בסיס משותף לרכיבי פורטל הלקוח: טיפוסים, קבועי עיצוב, עזרי תאריך וקריאות ל-API.

export type Tab = "results" | "crm" | "customers" | "conversations" | "escalations" | "insights" | "knowledge" | "settings";

export interface Row {
  id: string; createdAt: string; name: string; email: string; phone: string;
  business: string; msgCount: number; status: string; manualStatus: string;
  declineReason: string; source: string; utmSource: string; utmMedium: string;
  utmCampaign: string; utmContent: string; relevant: string;
  reportLink: string; reportStatus: string;
  meetingAt: string | null; cancelledAt: string | null;
  emailsSent: number; emailsOpened: number; emailsClicked: number;
  nextActionAt: string | null; nextActionNote: string; customerId: string | null;
}
export interface LeadNote { id: string; kind: string; text: string; createdAt: string }
export interface Detail {
  id: string; createdAt: string;
  fields: Record<string, unknown>; source: Record<string, string>;
  funnelStatus: string; statusOptions: string[];
  transcript: Array<{ role: string; text: string; at: string }>;
  report: { link: string; headline: string; meetingAt: string | null; cancelledAt: string | null } | null;
  emails: Array<{ key: string; subject: string; sentAt: string; openedAt: string | null; clickedAt: string | null; bouncedAt: string | null }>;
  nextActionAt: string | null; nextActionNote: string; notes: LeadNote[]; customerId: string | null;
}
export interface Customer {
  id: string; name: string; business: string; email: string; phone: string;
  stage: string; dealType: string; paid: boolean; amountPaid: number; monthlyFee: number; percentRate: number;
  notes: string; createdAt: string; sourceChatId?: string | null;
}
export interface Results {
  hasData: boolean;
  totals: { spend: number; impressions: number; clicks: number; cpc: number; leads: number; cpl: number; convRate: number };
  daily: Array<{ date: string; spend: number; leads: number }>;
  campaigns: Array<{ name: string; spend: number; clicks: number; leads: number; cpl: number }>;
  terms: Array<{ term: string; clicks: number; leads: number; cpl: number }>;
  business?: { relevantPct: number | null; closeRate: number | null; sales: number; roi: number | null };
}
export interface Escalation { id: string; chatId: string; chatName: string; question: string; status: string; answer: string; createdAt: string }
export interface KnowledgeItem { id: string; title: string; content: string; source: string; updatedAt: string }
export interface Insight {
  id: string; from: string; to: string; chatCount: number; createdAt: string; summary: string;
  topQuestions: Array<{ text: string; count: number }>; objections: Array<{ text: string; count: number }>;
  dropoffs: Array<{ text: string; count: number }>; recommendations: string[];
}
/** פרטי ליד שממלאים מראש את טופס סגירת העסקה */
export interface DealSeed { chatId?: string; name: string; business: string; phone: string; email: string }

export const DEAL_TYPES: Array<{ value: string; label: string }> = [
  { value: "one_time", label: "עסקה חד פעמית" },
  { value: "retainer", label: "ריטיינר חודשי" },
  { value: "setup_retainer", label: "הקמה חד פעמית + ריטיינר" },
  { value: "percent", label: "אחוזים מהעסקאות" },
];
export const dealLabel = (t: string) => DEAL_TYPES.find((d) => d.value === t)?.label ?? t;

export const NOTE_KINDS: Array<{ value: string; label: string }> = [
  { value: "note", label: "הערה" }, { value: "call", label: "שיחת טלפון" },
  { value: "whatsapp", label: "וואטסאפ" }, { value: "email", label: "מייל" },
];
export const noteLabel = (k: string) => NOTE_KINDS.find((n) => n.value === k)?.label ?? k;

export const EMAIL_LABELS: Record<string, string> = {
  report: "מייל הדוח", nurture1: "מייל מעקב 1", nurture3: "מייל מעקב 2", nurture7: "מייל מעקב 3",
  reminder: "תזכורת יום לפני", reminder1h: "תזכורת שעה לפני", cancelled: "מייל ביטול", test: "מייל בדיקה",
};
export const STATUS_CLS: Record<string, string> = {
  "שיחה": "bg-white/10 text-white/50",
  "השאיר פרטים": "bg-sky-400/15 text-sky-300",
  "קיבל דוח": "bg-brand-gold/20 text-brand-gold",
  "קבע פגישה": "bg-emerald-400/15 text-emerald-300",
  "ביטל פגישה": "bg-red-400/15 text-red-300",
  "סירב לפגישה": "bg-amber-400/15 text-amber-300",
  "חם": "bg-orange-400/20 text-orange-300",
  "נסגר": "bg-emerald-400/20 text-emerald-300",
  "חדש": "bg-sky-400/15 text-sky-300",
  "בטיפול": "bg-white/10 text-white/70",
  "לא רלוונטי": "bg-white/5 text-white/40",
};
export const STAGE_CLS: Record<string, string> = {
  "חדש": "bg-sky-400/15 text-sky-300",
  "אפיון": "bg-white/10 text-white/70",
  "הקמה": "bg-amber-400/15 text-amber-300",
  "קמפיין באוויר": "bg-brand-gold/20 text-brand-gold",
  "פעיל": "bg-emerald-400/15 text-emerald-300",
  "הסתיים": "bg-white/5 text-white/40",
};

export const inputCls = "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none";
export const cardCls = "rounded-xl border border-white/10 bg-white/[0.04]";
export const goldBtn = "inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-black transition-all duration-200 hover:brightness-95 disabled:opacity-40";
export const ghostBtn = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white";

export const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "";
export const fmtFull = (d: string | null) => d ? new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
export const fmtYmd = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
export const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

/** האם משימת ההמשך הגיעה (היום או קודם) */
export function isDue(at: string | null): boolean {
  if (!at) return false;
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return new Date(at).getTime() <= end.getTime();
}

/** ערך לשדה datetime-local מתוך תאריך ISO, בשעון המקומי */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** קישור לשיחת וואטסאפ ממספר ישראלי: 054-1234567 הופך ל-972541234567 */
export function waLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return "";
  const intl = digits.startsWith("972") ? digits : digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

// ---- טווחי תאריכים לדשבורד התוצאות ----
export type RangePreset = "month" | "last_month" | "7" | "30" | "90" | "custom";
export interface DateRange { preset: RangePreset; from: string; to: string }
export const RANGE_PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: "month", label: "החודש" }, { key: "last_month", label: "חודש קודם" },
  { key: "7", label: "7 ימים" }, { key: "30", label: "30 ימים" }, { key: "90", label: "90 ימים" },
  { key: "custom", label: "טווח מותאם" },
];
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function presetRange(preset: RangePreset, prev?: DateRange): DateRange {
  const now = new Date();
  const to = ymdLocal(now);
  if (preset === "month") return { preset, from: ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (preset === "last_month") {
    return { preset, from: ymdLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymdLocal(new Date(now.getFullYear(), now.getMonth(), 0)) };
  }
  if (preset === "custom") return { preset, from: prev?.from ?? to, to: prev?.to ?? to };
  const n = Number(preset);
  return { preset, from: ymdLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1))), to };
}

// ---- קריאות ל-API של הפורטל ----
export const AUTH_LOST_EVENT = "portal-auth-lost";

/** קריאה ל-API של הפורטל. כשהסשן פג (401) מודיע לעמוד לחזור למסך הכניסה. */
export async function portalApi<T = Record<string, unknown>>(
  token: string, opts: { query?: string; method?: "GET" | "POST" | "PATCH"; body?: unknown; path?: string } = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `/api/public/leads/${token}${opts.path ?? ""}${opts.query ? `?${opts.query}` : ""}`;
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !opts.path && typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_LOST_EVENT));
    return { ok: res.ok, status: res.status, data: data as T };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-brand-gold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}

export function PageTitle({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-white/50">{sub}</p>
      </div>
      {children}
    </div>
  );
}

export function DaysSelect({ days, setDays }: { days: number; setDays: (n: number) => void }) {
  return (
    <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls} aria-label="תקופה">
      <option value={7} className="bg-black">7 ימים</option>
      <option value={30} className="bg-black">30 ימים</option>
      <option value={90} className="bg-black">90 ימים</option>
      <option value={0} className="bg-black">הכל</option>
    </select>
  );
}
