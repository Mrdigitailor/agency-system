// רצף המיילים של משפך דוח הפוטנציאל — שכבה א'.
// שלושה מסלולים: קבע פגישה (תזכורת) / לא קבע (חימום) / ביטל (החזרה).
// כלל בית: בלי מקפים ארוכים. טון: חם, ישיר, בלי לחץ.
// הנוסח של כל מייל מגיע מ-email-templates (ברירת מחדל) או מגרסה שנערכה בטאב הדיוור.
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import type { PotentialReport } from "@/generated/prisma";
import { ZOOM_LINK } from "./scheduling";
import { type EmailKey, type EmailFields, specOf, fillTokens, textToParagraphs, plainText } from "./email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_BASE = process.env.APP_BASE_URL ?? "https://agency.mr-digitailor.co.il";
const FROM = "סער מ-Mr.digitailor <noreply@mr-digitailor.co.il>";
const REPLY_TO = "saar@digitailors.co.il";

export type { EmailKey } from "./email-templates";

const parseSent = (raw: string): EmailKey[] => { try { return JSON.parse(raw || "[]"); } catch { return []; } };

// ---------- תבנית עטיפה ----------
// לפי המוקאפ המאושר של סער: גוף נקי מיושר לימין, "בברכה, סער", קו מפריד דק,
// ואז החתימה הקבועה בשתי עמודות: מימין תמונה + שם + תפקיד + פרטי קשר עם
// אייקוני זהב (כולם לחיצים), משמאל הלוגו + משפט הניסיון + אייקוני רשתות.
// בתחתית: BETTER BUSINESSES · BRIGHTER TOMORROW.
// RTL מוצהר על כל רכיב (ג'ימייל מתעלם מהצהרות ברמת העמוד).
// פונט המותג Ploni נטען איפה שנתמך (Apple Mail, iPhone); ג'ימייל מציג חלופה.
const FONT = `'Ploni',Arial,'Segoe UI',sans-serif`;

// שתי העמודות בנויות כבלוקים נוזליים: במסך רחב הן יושבות זו לצד זו,
// ובמובייל הן נערמות אוטומטית זו מתחת לזו (בלי media queries, שלא כל לקוח מייל מכבד).
// הלוגו עם רקע לבן אפוי בקובץ — נבלע ברקע הבהיר, וקריא במצב כהה.
const SIGNATURE = `
  <div dir="rtl" style="margin-top:34px;padding-top:26px;border-top:1px solid #e8e6e1;direction:rtl;text-align:right;font-family:${FONT};font-size:0">
    <div dir="rtl" style="display:inline-block;vertical-align:top;width:100%;max-width:265px;direction:rtl;text-align:right;font-size:14px;padding-bottom:22px">
      <table dir="rtl" style="direction:rtl;border-collapse:collapse"><tr>
        <td style="vertical-align:middle;padding-left:12px">
          <img src="${APP_BASE}/images/sig-saar-photo.png" alt="סער אדרי" width="72" height="72" style="width:72px;height:72px;border-radius:50%;display:block">
        </td>
        <td dir="rtl" style="vertical-align:middle;text-align:right;direction:rtl">
          <div style="color:#8a6a15;font-size:16px;font-weight:600;font-family:${FONT}">סער אדרי</div>
          <div style="color:#666666;font-size:13px;margin-top:1px;font-family:${FONT}">Founder &amp; CEO</div>
        </td>
      </tr></table>
      <table dir="rtl" style="direction:rtl;border-collapse:collapse;margin-top:12px"><tr>
        <td style="vertical-align:middle;padding-left:8px"><img src="${APP_BASE}/images/social/icon-phone.png" alt="" width="16" height="16" style="width:16px;height:16px;display:block"></td>
        <td dir="rtl" style="vertical-align:middle;text-align:right"><a href="tel:+972547974206" style="color:#333333;font-size:13.5px;text-decoration:none;font-family:${FONT}">054-7974206</a></td>
      </tr><tr>
        <td style="vertical-align:middle;padding-left:8px;padding-top:6px"><img src="${APP_BASE}/images/social/icon-mail.png" alt="" width="16" height="16" style="width:16px;height:16px;display:block"></td>
        <td dir="rtl" style="vertical-align:middle;text-align:right;padding-top:6px"><a href="mailto:saar@digitailors.co.il" style="color:#333333;font-size:13.5px;text-decoration:none;font-family:${FONT}">saar@digitailors.co.il</a></td>
      </tr><tr>
        <td style="vertical-align:middle;padding-left:8px;padding-top:6px"><img src="${APP_BASE}/images/social/icon-link.png" alt="" width="16" height="16" style="width:16px;height:16px;display:block"></td>
        <td dir="rtl" style="vertical-align:middle;text-align:right;padding-top:6px"><a href="https://www.mr-digitailor.co.il/" style="color:#333333;font-size:13.5px;text-decoration:none;font-family:${FONT}">www.mr-digitailor.co.il</a></td>
      </tr></table>
    </div><div dir="rtl" style="display:inline-block;vertical-align:top;width:100%;max-width:265px;direction:rtl;text-align:right;font-size:14px;padding-bottom:10px">
      <a href="https://www.mr-digitailor.co.il/" style="text-decoration:none"><img src="${APP_BASE}/images/logo-sig.png" alt="Mr.digitailor" width="148" style="width:148px;height:auto;border:0;display:block"></a>
      <div dir="rtl" style="color:#666666;font-size:12.5px;line-height:1.65;margin-top:8px;text-align:right;font-family:${FONT}">ריכזנו 30 שנות ניסיון מצטבר של המוחות הטובים בעולמות השיווק לכדי מטרה אחת - לגרום לעסקים להכניס יותר לקוחות. מה עם העסק שלכם?</div>
      <div dir="rtl" style="margin-top:12px;text-align:right">
        <a href="https://www.instagram.com/mr.digitailor/" style="text-decoration:none;display:inline-block;margin-left:7px"><img src="${APP_BASE}/images/social/instagram-gray.png" alt="אינסטגרם" width="30" height="30" style="width:30px;height:30px;border:0"></a>
        <a href="https://www.linkedin.com/company/mr-digitailor/" style="text-decoration:none;display:inline-block;margin-left:7px"><img src="${APP_BASE}/images/social/linkedin-gray.png" alt="לינקדאין" width="30" height="30" style="width:30px;height:30px;border:0"></a>
        <a href="https://www.facebook.com/mrdigitailor" style="text-decoration:none;display:inline-block;margin-left:7px"><img src="${APP_BASE}/images/social/facebook-gray.png" alt="פייסבוק" width="30" height="30" style="width:30px;height:30px;border:0"></a>
        <a href="https://www.youtube.com/channel/UCCl4jpjricf061JqCeSkfQg" style="text-decoration:none;display:inline-block"><img src="${APP_BASE}/images/social/youtube-gray.png" alt="יוטיוב" width="30" height="30" style="width:30px;height:30px;border:0"></a>
      </div>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #efede8;text-align:center;color:#9a958c;font-size:10.5px;letter-spacing:3px;font-family:${FONT}">BETTER BUSINESSES &nbsp;·&nbsp; BRIGHTER TOMORROW</div>
  </div>`;

function shell(inner: string, opts: { preheader?: string; unsubscribeUrl?: string } = {}): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face{font-family:'Ploni';src:url('${APP_BASE}/fonts/ploni-light-aaa.woff') format('woff');font-weight:300}
@font-face{font-family:'Ploni';src:url('${APP_BASE}/fonts/ploni-regular-aaa.woff') format('woff');font-weight:400}
@font-face{font-family:'Ploni';src:url('${APP_BASE}/fonts/ploni-medium-aaa.woff') format('woff');font-weight:500}
@font-face{font-family:'Ploni';src:url('${APP_BASE}/fonts/ploni-demibold-aaa.woff') format('woff');font-weight:600}
</style></head>
<body dir="rtl" style="margin:0;background:#ffffff;padding:30px 18px;direction:rtl;font-family:${FONT}">
${opts.preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#ffffff">${opts.preheader}</div>` : ""}
<div dir="rtl" style="max-width:560px;margin:0 auto;direction:rtl;font-family:${FONT}">
  <div dir="rtl" style="color:#111111;font-size:16.5px;line-height:1.8;direction:rtl;text-align:right;font-family:${FONT}">${inner}
  <p style="margin-top:26px">בברכה,<br>סער</p></div>
  ${SIGNATURE}
  ${opts.unsubscribeUrl ? `<div dir="rtl" style="margin-top:14px;text-align:center;color:#b0aba2;font-size:11.5px;font-family:${FONT}">לא רוצה לקבל מאיתנו מיילים נוספים? <a href="${opts.unsubscribeUrl}" style="color:#9a958c;text-decoration:underline">להסרה מרשימת התפוצה</a></div>` : ""}
</div></body></html>`;
}

const btn = (href: string, label: string) =>
  `<div dir="rtl" style="margin:24px 0;text-align:right"><a href="${href}" style="background:#eed89b;color:#000000;font-weight:600;font-size:15.5px;padding:14px 34px;border-radius:10px;text-decoration:none;display:inline-block;font-family:${FONT}">${label} &larr;</a></div>`;

const firstName = (r: PotentialReport) => (r.contactName || "").trim().split(/\s+/)[0] || "";

function teaser(r: PotentialReport): string {
  try {
    const c = JSON.parse(r.chain);
    if (!c?.ok) return "";
    const firstBasis = c.dealValueFirst > 0;
    const low = Math.ceil(Math.max(firstBasis ? c.revenueFirst.head : c.revenueFull.head, 0) / 100) * 100;
    const high = Math.ceil(Math.max(firstBasis ? c.revenueFirst.best : c.revenueFull.best, 0) / 100) * 100;
    const range = low === high ? `סביב ${low.toLocaleString("he-IL")} ₪` : `בין ${low.toLocaleString("he-IL")} ל-${high.toLocaleString("he-IL")} ₪`;
    return `<div dir="rtl" style="border-right:3px solid #eed89b;padding:4px 18px 6px 0;margin:22px 0;direction:rtl;text-align:right">
      <div style="color:#8c8777;font-size:13.5px;font-family:${FONT}">פוטנציאל משוער להכנסות שלך</div>
      <div style="color:#b8860b;font-size:26px;font-weight:600;margin-top:2px;font-family:${FONT}">${range} בחודש</div>
      <div style="color:#8c8777;font-size:13px;margin-top:3px;font-family:${FONT}">לפי תקציב של ${Math.round(r.budget).toLocaleString("he-IL")} ₪ ונתוני גוגל בתחום שלך</div>
    </div>`;
  } catch { return ""; }
}

// ---------- המיילים עצמם ----------
const SMALL = "color:#666666;font-size:14px";

/** בונה מייל מהמבנה הקבוע של המפתח ומהנוסח שנבחר (ברירת מחדל או גרסה ערוכה) */
export function buildEmail(key: EmailKey, r: PotentialReport, fields?: EmailFields): { subject: string; html: string } | null {
  const spec = specOf(key);
  if (!spec) return null;
  const f = fields ?? spec.defaults;

  const meeting = r.meetingAt ? new Date(r.meetingAt) : null;
  const values = {
    name: firstName(r),
    field: r.serviceField ?? "",
    when: meeting ? meeting.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
    time: meeting ? meeting.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }) : "",
  };
  const t = (text: string) => fillTokens(text, values);

  const block = spec.block === "teaser" ? teaser(r)
    : spec.block === "meeting" ? `<p dir="rtl" style="background:#faf6e9;border-radius:10px;padding:14px 18px;text-align:right"><b style="color:#8a6a15">📅 ${plainText(values.when)}</b><br>
<a href="${ZOOM_LINK}" style="color:#8a6a15;font-weight:bold">קישור הזום לפגישה</a></p>`
    : "";
  const href = spec.button === "report" ? `${APP_BASE}/report/${r.token}` : spec.button === "zoom" ? ZOOM_LINK : `${APP_BASE}/start`;
  const label = plainText(t(f.buttonLabel)).trim();

  const inner = [
    textToParagraphs(t(f.bodyBefore)),
    block,
    textToParagraphs(t(f.bodyAfter)),
    label ? btn(href, label) : "",
    spec.button === "zoom" ? `<p style="${SMALL}">${ZOOM_LINK}</p>` : "",
    textToParagraphs(t(f.footnote), SMALL),
  ].filter(Boolean).join("\n");

  return {
    subject: t(f.subject).replace(/[—–]/g, "-").trim(),
    html: shell(inner, {
      preheader: plainText(t(f.preheader)),
      unsubscribeUrl: spec.marketing ? `${APP_BASE}/unsubscribe/${r.token}` : undefined,
    }),
  };
}

/** תצוגה מקדימה לבדיקות עיצוב — מחזיר את ה-HTML בלי לשלוח */
export function previewProspectEmail(key: EmailKey, r: PotentialReport, fields?: EmailFields): { subject: string; html: string } | null {
  return buildEmail(key, r, fields);
}

/** הפורטל שהדוח שייך אליו: דרך השיחה שיצרה אותו, אחרת פורטל ברירת המחדל */
async function portalOfReport(reportId: string) {
  const chat = await prisma.prospectChat.findFirst({ where: { reportId }, select: { portalId: true } });
  if (chat?.portalId) return prisma.funnelPortal.findUnique({ where: { id: chat.portalId } });
  return prisma.funnelPortal.findFirst({ where: { isDefault: true, deletedAt: null } });
}

/** הנוסח הנוכחי של מייל בפורטל: הגרסה האחרונה שנשמרה, או ברירת המחדל (גרסה 1) */
export async function currentEmailFields(portalId: string | null, key: EmailKey): Promise<{ fields: EmailFields; version: number }> {
  const spec = specOf(key)!;
  if (!portalId) return { fields: spec.defaults, version: 1 };
  const v = await prisma.portalEmailVersion.findFirst({ where: { portalId, key }, orderBy: { version: "desc" } });
  if (!v) return { fields: spec.defaults, version: 1 };
  return {
    version: v.version,
    fields: { subject: v.subject, preheader: v.preheader, bodyBefore: v.bodyBefore, bodyAfter: v.bodyAfter, buttonLabel: v.buttonLabel, footnote: v.footnote },
  };
}

/** שולח מייל אחד ומסמן אותו כנשלח. לא שולח פעמיים. */
export async function sendProspectEmail(reportId: string, key: EmailKey): Promise<boolean> {
  const r = await prisma.potentialReport.findUnique({ where: { id: reportId } });
  if (!r || !r.contactEmail) return false;
  const sent = parseSent(r.emailsSent);
  if (sent.includes(key)) return false;

  const spec = specOf(key);
  if (!spec) return false;
  // מי שביקש הסרה לא מקבל מיילי המשך (מיילים תפעוליים כמו תזכורת פגישה ממשיכים)
  if (spec.marketing && r.unsubscribedAt) return false;

  const portal = await portalOfReport(r.id).catch(() => null);
  const disabled: string[] = (() => { try { return JSON.parse(portal?.disabledEmails || "[]"); } catch { return []; } })();
  if (disabled.includes(key)) return false;

  const { fields, version } = await currentEmailFields(portal?.id ?? null, key);
  const email = buildEmail(key, r, fields);
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
    // תיעוד לטאב הדיוור — אירועי פתיחה/הקלקה יתווספו דרך ה-webhook של Resend
    await prisma.prospectEmailLog.create({
      data: { reportId: r.id, key, resendId: res.data?.id ?? "", subject: email.subject, portalId: portal?.id ?? null, version },
    }).catch(() => {});
    console.log(`[ProspectEmail] sent ${key} v${version} to ${r.contactEmail}`);
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
