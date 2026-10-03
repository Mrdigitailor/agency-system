// נתוני הדמו של פורטל הלידים — מה שמציגים בשיחת מכירה: "הנה מה שתקבל".
// הכל מומצא, התאריכים יחסיים להיום כדי שהדמו תמיד ייראה חי.
import type { FunnelRow, FunnelStats, FunnelDetail } from "./funnel-data";
import { computeStats, FUNNEL_STATUS_OPTIONS } from "./funnel-data";

const h = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
const inDays = (d: number, hour: number) => {
  const x = new Date(Date.now() + d * 24 * 3600_000);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
};

const base = {
  reportLink: "", leadId: null as string | null, manualStatus: "", declineReason: "",
  cancelledAt: null as string | null, meetingAt: null as string | null,
  emailsSent: 0, emailsOpened: 0, emailsClicked: 0, budget: 0,
  utmSource: "google", utmMedium: "cpc", utmCampaign: "קמפיין חיפוש ראשי", utmContent: "קבוצת מודעות - שירות", relevant: "",
};

export const DEMO_ROWS: FunnelRow[] = [
  { ...base, id: "demo-1", relevant: "yes", createdAt: h(3), updatedAt: h(2), name: "אורי ברק", email: "uri@example.co.il", phone: "050-1234567",
    business: "עורך דין מקרקעין", budget: 6000, msgCount: 22, status: "קבע פגישה", derivedStatus: "קבע פגישה",
    source: "עורך דין מקרקעין", reportStatus: "ready", meetingAt: inDays(2, 10), emailsSent: 1, emailsOpened: 1, emailsClicked: 1 },
  { ...base, id: "demo-2", relevant: "yes", createdAt: h(8), updatedAt: h(7), name: "מיכל אדן", email: "michal@example.co.il", phone: "052-7654321",
    business: "מרפאת אסתטיקה", budget: 8000, msgCount: 19, status: "קבע פגישה", derivedStatus: "קבע פגישה",
    source: "הזרקות בוטוקס מחיר", reportStatus: "ready", meetingAt: inDays(1, 13), emailsSent: 2, emailsOpened: 2, emailsClicked: 1 },
  { ...base, id: "demo-3", relevant: "yes", createdAt: h(26), updatedAt: h(25), name: "יוסי מזרחי", email: "yossi@example.co.il", phone: "",
    business: "אינסטלציה ותיקוני צנרת", budget: 3500, msgCount: 16, status: "קיבל דוח", derivedStatus: "קיבל דוח",
    source: "אינסטלטור בחיפה", reportStatus: "ready", emailsSent: 2, emailsOpened: 1 },
  { ...base, id: "demo-4", relevant: "yes", createdAt: h(30), updatedAt: h(29), name: "רונית שגב", email: "ronit@example.co.il", phone: "054-9876543",
    business: "סטודיו לעיצוב פנים", budget: 5000, msgCount: 21, status: "חם", derivedStatus: "קיבל דוח", manualStatus: "חם",
    source: "מעצבת פנים תל אביב", reportStatus: "ready", emailsSent: 2, emailsOpened: 2, emailsClicked: 1 },
  { ...base, id: "demo-5", createdAt: h(50), updatedAt: h(49), name: "דנה לוי", email: "dana@example.co.il", phone: "",
    business: "קליניקת שיניים", budget: 0, msgCount: 9, status: "השאיר פרטים", derivedStatus: "השאיר פרטים",
    source: "השתלות שיניים", reportStatus: "", emailsSent: 0 },
  { ...base, id: "demo-6", createdAt: h(54), updatedAt: h(54), name: "", email: "", phone: "",
    business: "שיפוצים", budget: 0, msgCount: 4, status: "שיחה", derivedStatus: "שיחה",
    source: "קבלן שיפוצים מרכז", reportStatus: "" },
  { ...base, id: "demo-7", relevant: "yes", createdAt: h(76), updatedAt: h(70), name: "אבי כהן", email: "avi@example.co.il", phone: "053-1112233",
    business: "הובלות ומשלוחים", budget: 4000, msgCount: 18, status: "סירב לפגישה", derivedStatus: "סירב לפגישה", declineReason: "אין לי זמן כרגע, אולי בעוד חודש",
    source: "הובלות דירה מחיר", reportStatus: "ready", emailsSent: 3, emailsOpened: 2 },
  { ...base, id: "demo-8", relevant: "no", createdAt: h(120), updatedAt: h(96), name: "נועם פרץ", email: "noam@example.co.il", phone: "058-4455667",
    business: "מכון כושר אישי", budget: 3000, msgCount: 20, status: "ביטל פגישה", derivedStatus: "ביטל פגישה",
    source: "מאמן כושר אישי", reportStatus: "ready", cancelledAt: h(96), emailsSent: 4, emailsOpened: 3, emailsClicked: 2 },
  { ...base, id: "demo-9", relevant: "yes", createdAt: h(200), updatedAt: h(140), name: "שירה גולן", email: "shira@example.co.il", phone: "050-7788990",
    business: "משרד רואי חשבון", budget: 7000, msgCount: 24, status: "נסגר", derivedStatus: "קבע פגישה", manualStatus: "נסגר",
    source: "רואה חשבון לעצמאיים", reportStatus: "ready", meetingAt: h(150), emailsSent: 2, emailsOpened: 2, emailsClicked: 2 },
  // שיחות אנונימיות קצרות — כדי שיחסי ההמרה בדמו ייראו אמינים
  ...[14, 37, 62, 88, 110, 145, 170].map((hoursAgo, i) => ({
    ...base, id: `demo-a${i}`, createdAt: h(hoursAgo), updatedAt: h(hoursAgo), name: "", email: "", phone: "",
    business: "", budget: 0, msgCount: i % 3 === 0 ? 1 : 3, status: "שיחה", derivedStatus: "שיחה",
    source: ["עורך דין מקרקעין", "אינסטלטור בחיפה", "השתלות שיניים", "מאמן כושר אישי", "הובלות דירה מחיר", "מעצבת פנים תל אביב", "קבלן שיפוצים מרכז"][i],
    reportStatus: "", manualStatus: "", declineReason: "", meetingAt: null, cancelledAt: null,
  })),
];

export const DEMO_STATS: FunnelStats = computeStats(DEMO_ROWS);

const demoTranscript = (biz: string, name: string): FunnelDetail["transcript"] => [
  { role: "assistant", text: "היי 👋 אני העוזר הדיגיטלי של Mr.digitailor.\nתוך שתי דקות אני יכול להראות לך, במספרים אמיתיים מגוגל, כמה לקוחות והכנסות העסק שלך יכול להוציא מקמפיין חכם. שנבדוק?", at: "" },
  { role: "user", text: "יאללה, בוא נבדוק", at: "" },
  { role: "assistant", text: "מעולה! לפני שנצלול, איך קוראים לך?", at: "" },
  { role: "user", text: name, at: "" },
  { role: "assistant", text: `נעים מאוד ${name}! במה העסק שלך עוסק?`, at: "" },
  { role: "user", text: biz, at: "" },
  { role: "assistant", text: "מצוין. איפה אתה נותן שירות?", at: "" },
  { role: "user", text: "כל הארץ", at: "" },
  { role: "assistant", text: "אני ניגש עכשיו לגוגל לבדוק את התחום שלך בזמן אמת 🔍\nתן לי בערך 15 שניות.", at: "" },
  { role: "assistant", text: `${name}, יש לי את המספרים שלך 👇\n🔍 8,400 חיפושים בחודש של אנשים שמחפשים בדיוק את מה שאתה עושה\n💰 תקציב של 6,000 ₪ יכול לייצר אצלך בין 94,000 ל-168,000 ₪ בחודש\nהכנתי לך דוח מלא עם כל הפירוק של המספרים. לאיזה מייל לשלוח לך אותו?`, at: "" },
  { role: "user", text: "המייל שלי בפנים, שלח", at: "" },
  { role: "assistant", text: "מעולה, הדוח שלך כאן 👇\nכנס, צפה בדוח, ותחזור אליי לכאן, אני מחכה לך 😉", at: "" },
  { role: "user", text: "מצוין, עברתי על הדוח", at: "" },
  { role: "assistant", text: "המספרים בדוח הם הפוטנציאל. בפגישת זום של 30 דקות עוברים על הניתוח, מסתכלים יחד על המתחרים שלך בשידור חי, ואתה יוצא עם תמונה ברורה מה צריך לקרות. בלי עלות ובלי מחויבות. שווה לך?", at: "" },
  { role: "user", text: "יאללה, מתי אפשר?", at: "" },
];

const demoEmails = (opened: boolean, clicked: boolean): FunnelDetail["emails"] => [
  { key: "report", subject: "דוח הפוטנציאל שלך מוכן", sentAt: h(3),
    deliveredAt: h(3), openedAt: opened ? h(2.5) : null, clickedAt: clicked ? h(2.2) : null, bouncedAt: null },
];

export function demoDetail(id: string): FunnelDetail | null {
  const row = DEMO_ROWS.find((r) => r.id === id);
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.createdAt,
    fields: {
      name: row.name || undefined, email: row.email || undefined, phone: row.phone || undefined,
      serviceField: row.business, budget: row.budget || undefined,
      declineReason: row.declineReason || undefined,
    },
    source: { utm_source: "google", utm_campaign: "קמפיין חיפוש ראשי", utm_term: row.source },
    funnelStatus: row.manualStatus,
    statusOptions: FUNNEL_STATUS_OPTIONS,
    transcript: demoTranscript(row.business, row.name || "אנונימי"),
    report: row.reportStatus === "ready" ? {
      status: "ready", link: "", headline: "94,000 עד 168,000 ₪ בחודש",
      budget: row.budget, meetingAt: row.meetingAt, bookedAt: row.meetingAt, cancelledAt: row.cancelledAt,
    } : null,
    emails: row.emailsSent > 0 ? demoEmails(row.emailsOpened > 0, row.emailsClicked > 0) : [],
    lead: null,
  };
}

// ==================== דמו: לקוחות ====================
export interface DemoCustomer {
  id: string; name: string; business: string; email: string; phone: string;
  stage: string; dealType: string; paid: boolean; amountPaid: number; monthlyFee: number; percentRate: number; notes: string; createdAt: string;
}
export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { id: "dc-1", name: "שירה גולן", business: "משרד רואי חשבון", email: "shira@example.co.il", phone: "050-7788990",
    stage: "קמפיין באוויר", dealType: "setup_retainer", paid: true, amountPaid: 14800, monthlyFee: 800, percentRate: 0, notes: "נסגרה אחרי פגישה ראשונה. הקמפיין עלה ב-01 לחודש.", createdAt: h(140) },
  { id: "dc-2", name: "אורי ברק", business: "עורך דין מקרקעין", email: "uri@example.co.il", phone: "050-1234567",
    stage: "הקמה", dealType: "setup_retainer", paid: true, amountPaid: 14800, monthlyFee: 800, percentRate: 0, notes: "דף הנחיתה באישור אצלו, ממתינים לחומרים.", createdAt: h(60) },
  { id: "dc-3", name: "מיכל אדן", business: "מרפאת אסתטיקה", email: "michal@example.co.il", phone: "052-7654321",
    stage: "אפיון", dealType: "percent", paid: false, amountPaid: 0, monthlyFee: 0, percentRate: 12, notes: "חתמה על הצעה, תשלום ביום ההקמה.", createdAt: h(20) },
];

// ==================== דמו: דשבורד תוצאות ====================
import type { ResultsData } from "./funnel-data";

function demoDaily(): ResultsData["daily"] {
  const out: ResultsData["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600_000);
    const wave = 1 + 0.25 * Math.sin(i / 2.1);
    out.push({
      date: d.toISOString().slice(0, 10),
      spend: Math.round(215 * wave + (i % 3) * 14),
      leads: Math.round((3.6 * wave + (i % 2)) * 10) / 10,
    });
  }
  return out;
}
const DEMO_DAILY = demoDaily();
const demoSpend = DEMO_DAILY.reduce((s, d) => s + d.spend, 0);
const demoLeads = Math.round(DEMO_DAILY.reduce((s, d) => s + d.leads, 0));
const demoClicks = Math.round(demoSpend / 7.4);

export const DEMO_RESULTS: ResultsData = {
  hasData: true,
  totals: {
    spend: demoSpend, impressions: demoClicks * 19, clicks: demoClicks,
    cpc: demoSpend / demoClicks, leads: demoLeads, cpl: demoSpend / demoLeads,
    convRate: (demoLeads / demoClicks) * 100,
  },
  daily: DEMO_DAILY,
  campaigns: [
    { name: "חיפוש · ביטויי שירות", spend: Math.round(demoSpend * 0.52), clicks: Math.round(demoClicks * 0.48), leads: Math.round(demoLeads * 0.58), cpl: 48 },
    { name: "חיפוש · ביטויי מחיר", spend: Math.round(demoSpend * 0.31), clicks: Math.round(demoClicks * 0.34), leads: Math.round(demoLeads * 0.3), cpl: 56 },
    { name: "מיקוד מתחרים", spend: Math.round(demoSpend * 0.17), clicks: Math.round(demoClicks * 0.18), leads: Math.round(demoLeads * 0.12), cpl: 74 },
  ],
  terms: [
    { term: "עורך דין מקרקעין", clicks: 212, leads: 21, cpl: 44 },
    { term: "עורך דין נדלן מחיר", clicks: 150, leads: 14, cpl: 52 },
    { term: "עו\"ד מקרקעין תל אביב", clicks: 118, leads: 11, cpl: 49 },
    { term: "ליווי משפטי קניית דירה", clicks: 96, leads: 8, cpl: 61 },
    { term: "עורך דין קבוצת רכישה", clicks: 64, leads: 5, cpl: 70 },
    { term: "בדיקת חוזה דירה", clicks: 51, leads: 4, cpl: 58 },
  ],
};

// ==================== דמו: אסקלציות ====================
export interface DemoEscalation {
  id: string; chatId: string; chatName: string; question: string;
  status: string; answer: string; createdAt: string;
}
export const DEMO_ESCALATIONS: DemoEscalation[] = [
  { id: "esc-1", chatId: "demo-3", chatName: "יוסי מזרחי · אינסטלציה", status: "open", answer: "", createdAt: h(20),
    question: "הליד שאל אם אתם עובדים גם עם לקוחות פרטיים או רק עם עסקים, ומה קורה אם יש לו כבר קמפיין פעיל בגוגל שמנוהל על ידי פרילנסר" },
  { id: "esc-2", chatId: "demo-5", chatName: "דנה לוי · קליניקת שיניים", status: "open", answer: "", createdAt: h(44),
    question: "הליד שאל האם אפשר לפצל את תשלום ההקמה לשלושה תשלומים" },
  { id: "esc-3", chatId: "demo-7", chatName: "אבי כהן · הובלות", status: "answered", createdAt: h(90),
    answer: "כן, יש התחייבות לשלושה חודשים ראשונים בלבד, ואחרי זה אפשר להפסיק בהודעה של 30 יום מראש.",
    question: "הליד שאל אם יש התחייבות לתקופה מינימלית בשירות החודשי" },
];

// ==================== דמו: מדדי עסק ====================
export const DEMO_BUSINESS_METRICS = {
  relevantPct: 85.7,  // 6 מתוך 7 שסומנו
  closeRate: 37.5,    // 3 לקוחות מתוך 8 לידים עם פרטים
  salesMonth: 31200,  // 2 הקמות + 2 ריטיינרים
  roiMonth: 9.8,      // מול כ-3,200 ₪ הוצאת פרסום
};
