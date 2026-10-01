// רצף המיילים של משפך דוח הפוטנציאל — שכבה א'.
// שלושה מסלולים: קבע פגישה (תזכורת) / לא קבע (חימום) / ביטל (החזרה).
// כלל בית: בלי מקפים ארוכים. טון: חם, ישיר, בלי לחץ.
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import type { PotentialReport } from "@/generated/prisma";
import { ZOOM_LINK } from "./scheduling";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_BASE = process.env.APP_BASE_URL ?? "https://agency.mr-digitailor.co.il";
const FROM = "סער מ-Mr.digitailor <noreply@mr-digitailor.co.il>";
const REPLY_TO = "saar@digitailors.co.il";

export type EmailKey = "report" | "nurture1" | "nurture3" | "nurture7" | "reminder" | "cancelled";

const parseSent = (raw: string): EmailKey[] => { try { return JSON.parse(raw || "[]"); } catch { return []; } };

// ---------- תבנית עטיפה ממותגת ----------
// שפת המערכת: רקע בהיר, כרטיס לבן, כותרת שחורה עם הלוגו, זהב להדגשות.
// RTL מוצהר על כל רכיב (ג'ימייל מתעלם מהצהרות ברמת העמוד).
// Ploni נטען איפה שנתמך (Apple Mail); ג'ימייל יציג Arial.
function shell(inner: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face{font-family:'Ploni';src:url('${APP_BASE}/fonts/ploni-regular-aaa.woff') format('woff');font-weight:400}
@font-face{font-family:'Ploni';src:url('${APP_BASE}/fonts/ploni-demibold-aaa.woff') format('woff');font-weight:600}
</style></head>
<body dir="rtl" style="margin:0;background:#f5f5f5;padding:28px 12px;direction:rtl">
<div dir="rtl" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;direction:rtl;font-family:'Ploni',Arial,'Segoe UI',sans-serif">
  <div dir="rtl" style="background:#000000;padding:16px 24px;text-align:right">
    <img src="${APP_BASE}/images/logo-email.png" alt="Mr.digitailor" height="34" style="height:34px;display:inline-block;border:0">
  </div>
  <div dir="rtl" style="padding:28px 26px;color:#111111;font-size:16px;line-height:1.75;direction:rtl;text-align:right">${inner}</div>
  <div dir="rtl" style="padding:14px 26px;border-top:1px solid #e0e0e0;color:#999999;font-size:12px;direction:rtl;text-align:right">
    Mr.digitailor · שיווק דיגיטלי שתפור עליך<br>אפשר פשוט להשיב למייל הזה, אני קורא הכל.
  </div>
</div></body></html>`;
}

const btn = (href: string, label: string) =>
  `<div dir="rtl" style="margin:22px 0;text-align:right"><a href="${href}" style="background:#eed89b;color:#000000;font-weight:bold;font-size:15px;padding:13px 30px;border-radius:8px;text-decoration:none;display:inline-block">${label}</a></div>`;

const firstName = (r: PotentialReport) => (r.contactName || "").trim().split(/\s+/)[0] || "";

function teaser(r: PotentialReport): string {
  try {
    const c = JSON.parse(r.chain);
    if (!c?.ok) return "";
    const firstBasis = c.dealValueFirst > 0;
    const low = Math.ceil(Math.max(firstBasis ? c.revenueFirst.head : c.revenueFull.head, 0) / 100) * 100;
    const high = Math.ceil(Math.max(firstBasis ? c.revenueFirst.best : c.revenueFull.best, 0) / 100) * 100;
    const range = low === high ? `סביב ${low.toLocaleString("he-IL")} ₪` : `בין ${low.toLocaleString("he-IL")} ל-${high.toLocaleString("he-IL")} ₪`;
    return `<div dir="rtl" style="background:#faf6e9;border:1px solid #e0c987;border-radius:10px;padding:16px 18px;margin:18px 0;direction:rtl;text-align:right">
      <div style="color:#8a6a15;font-size:12px;letter-spacing:2px;margin-bottom:6px">תזכורת למספרים שלך</div>
      <div style="color:#8a6a15;font-size:23px;font-weight:bold">${range} בחודש</div>
      <div style="color:#666666;font-size:13px;margin-top:4px">פוטנציאל מתקציב של ${Math.round(r.budget).toLocaleString("he-IL")} ₪, לפי נתוני גוגל בתחום שלך</div>
    </div>`;
  } catch { return ""; }
}

// ---------- המיילים עצמם ----------
function buildEmail(key: EmailKey, r: PotentialReport): { subject: string; html: string } | null {
  const name = firstName(r);
  const hi = name ? `היי ${name},` : "היי,";
  const reportUrl = `${APP_BASE}/report/${r.token}`;
  const startUrl = `${APP_BASE}/start`;

  if (key === "report") {
    return {
      subject: name ? `${name}, דוח הפוטנציאל שלך מוכן` : "דוח הפוטנציאל שלך מוכן",
      html: shell(`<p>${hi}</p>
<p>כמו שהבטחתי בשיחה, הנה הדוח המלא על ${r.serviceField ? `תחום ${r.serviceField}` : "העסק שלך"}: הביקוש בגוגל, המחירים האמיתיים, וכל שלב בחישוב.</p>
${teaser(r)}
${btn(reportUrl, "לצפייה בדוח המלא")}
<p style="color:#666666;font-size:14px">הדוח שמור אצלנו על השם שלך, אפשר לחזור אליו מתי שרוצים.</p>`),
    };
  }

  if (key === "nurture1") {
    return {
      subject: name ? `${name}, הספקת לעבור על המספרים?` : "הספקת לעבור על המספרים?",
      html: shell(`<p>${hi}</p>
<p>אתמול הכנו לך דוח פוטנציאל על העסק. רציתי לוודא שהוא הגיע ושהספקת להציץ.</p>
${teaser(r)}
<p>אם משהו במספרים לא ברור, או שאתה רוצה להבין איך מגיעים אליהם בפועל, בפגישת זום קצרה של 30 דקות עם סער עוברים על הכל יחד: הניתוח, המתחרים שלך בשידור חי, והצעדים. בלי עלות ובלי מחויבות.</p>
${btn(startUrl, "לקביעת פגישה")}
<p style="color:#666666;font-size:14px">ואם עכשיו לא הזמן, הכל טוב. הדוח נשאר שלך.</p>`),
    };
  }

  if (key === "nurture3") {
    return {
      subject: "למה לידים לבד לא מספיקים",
      html: shell(`<p>${hi}</p>
<p>משהו שלמדנו אחרי שנים עם עשרות עסקים: ההבדל בין קמפיין שמרוויח לקמפיין ששורף כסף הוא כמעט אף פעם לא הלידים עצמם. זה מה שקורה להם אחרי.</p>
<p>ליד שמקבל מענה תוך שעה שווה פי כמה מליד שמחכה ליום המחרת. ליד שמגיע לפגישה מוכן שווה פי כמה ממי שצריך לשכנע מאפס. בדיוק בשביל זה בנינו מערכת שמטפלת בכל השרשרת, לא רק בקליקים.</p>
<p>בדוח שלך ראית מה הפוטנציאל. בפגישה מראים איך הופכים אותו למציאות אצלך:</p>
${btn(startUrl, "לתיאום 30 דקות עם סער")}`),
    };
  }

  if (key === "nurture7") {
    return {
      subject: name ? `${name}, הדוח שלך עדיין שמור` : "הדוח שלך עדיין שמור",
      html: shell(`<p>${hi}</p>
<p>לפני שבוע הכנו לך דוח פוטנציאל, והוא עדיין שמור אצלנו על השם שלך.</p>
${teaser(r)}
<p>אני לא אציף אותך במיילים. רק אגיד שאם תרצה לעבור על המספרים יחד, בזמן שנוח לך, הדלת פתוחה. ואם נוח לך יותר בטלפון, פשוט השב למייל הזה עם המספר ונחזור אליך.</p>
${btn(reportUrl, "לדוח שלך")}`),
    };
  }

  if (key === "reminder") {
    const when = r.meetingAt
      ? new Date(r.meetingAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "";
    return {
      subject: `מחר נפגשים 👋 ${when}`,
      html: shell(`<p>${hi}</p>
<p>תזכורת קטנה: מחר בשעה שקבענו נפגשים בזום לעבור על דוח הפוטנציאל שלך.</p>
<p dir="rtl" style="background:#faf6e9;border:1px solid #e0c987;border-radius:10px;padding:14px 18px;text-align:right"><b style="color:#8a6a15">📅 ${when}</b><br>
<a href="${ZOOM_LINK}" style="color:#8a6a15;font-weight:bold">קישור הזום לפגישה</a></p>
<p>שווה לפתוח את הדוח לפני, ולהכין כל שאלה שעולה לך. סער יעבור איתך על הכל, כולל הצצה חיה למתחרים שלך.</p>
${btn(reportUrl, "לרענון הדוח לפני הפגישה")}`),
    };
  }

  if (key === "cancelled") {
    return {
      subject: name ? `${name}, נתפס לך משהו?` : "נתפס לך משהו?",
      html: shell(`<p>${hi}</p>
<p>ראיתי שהפגישה שלנו ירדה מהיומן. קורה, החיים דינמיים.</p>
<p>הדוח שלך עדיין שמור, והיומן של סער פתוח. אפשר לקבוע מועד חדש בדקה, או פשוט להשיב למייל הזה עם זמן שנוח לך.</p>
${btn(startUrl, "לקביעת מועד חדש")}`),
    };
  }

  return null;
}

/** תצוגה מקדימה לבדיקות עיצוב — מחזיר את ה-HTML בלי לשלוח */
export function previewProspectEmail(key: EmailKey, r: PotentialReport): { subject: string; html: string } | null {
  return buildEmail(key, r);
}

/** שולח מייל אחד ומסמן אותו כנשלח. לא שולח פעמיים. */
export async function sendProspectEmail(reportId: string, key: EmailKey): Promise<boolean> {
  const r = await prisma.potentialReport.findUnique({ where: { id: reportId } });
  if (!r || !r.contactEmail) return false;
  const sent = parseSent(r.emailsSent);
  if (sent.includes(key)) return false;

  const email = buildEmail(key, r);
  if (!email) return false;

  try {
    const res = await resend.emails.send({
      from: FROM, to: r.contactEmail, replyTo: REPLY_TO,
      subject: email.subject, html: email.html,
    });
    if (res.error) { console.error(`[ProspectEmail] ${key} failed:`, res.error.message); return false; }
    await prisma.potentialReport.update({
      where: { id: r.id },
      data: { emailsSent: JSON.stringify([...sent, key]) },
    });
    console.log(`[ProspectEmail] sent ${key} to ${r.contactEmail}`);
    return true;
  } catch (err) {
    console.error(`[ProspectEmail] ${key} exception:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** מייל הדוח נשלח מיד כשיש אימייל ודוח מוכן */
export async function maybeSendReportEmail(reportId: string): Promise<void> {
  const r = await prisma.potentialReport.findUnique({ where: { id: reportId } });
  if (r && r.status === "ready" && r.contactEmail) await sendProspectEmail(reportId, "report");
}
