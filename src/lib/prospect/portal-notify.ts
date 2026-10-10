// מיילים של המערכת לבעל הפורטל: התראה מיידית על ליד חדש ועל פגישה שנקבעה, ודוח שבועי.
// אלה מיילים תפעוליים מ"מכונת הלידים", לא מיילים שיווקיים ללידים (אלה ב-emails.ts).
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import type { FunnelPortal } from "@/generated/prisma";
import { sourceLabel } from "./funnel-data";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_BASE = process.env.APP_BASE_URL ?? "https://agency.mr-digitailor.co.il";
const FROM = "מכונת הלידים · Mr.digitailor <noreply@mr-digitailor.co.il>";
const FONT = `'Ploni',Arial,'Segoe UI',sans-serif`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const portalUrl = (portal: FunnelPortal) => `${APP_BASE}/leads/${portal.token}`;

function shell(title: string, inner: string, portal: FunnelPortal, cta = "לכניסה למערכת"): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body dir="rtl" style="margin:0;background:#ffffff;padding:28px 18px;direction:rtl;font-family:${FONT}">
<div dir="rtl" style="max-width:540px;margin:0 auto;direction:rtl;text-align:right;font-family:${FONT}">
  <img src="${APP_BASE}/images/logo-sig.png" alt="Mr.digitailor" width="140" style="width:140px;height:auto;border:0;display:block;margin-bottom:22px">
  <div style="color:#111111;font-size:20px;font-weight:600;margin-bottom:14px;font-family:${FONT}">${title}</div>
  <div dir="rtl" style="color:#222222;font-size:15.5px;line-height:1.75;direction:rtl;text-align:right;font-family:${FONT}">${inner}</div>
  <div dir="rtl" style="margin:24px 0;text-align:right"><a href="${portalUrl(portal)}" style="background:#eed89b;color:#000000;font-weight:600;font-size:15px;padding:13px 30px;border-radius:10px;text-decoration:none;display:inline-block;font-family:${FONT}">${cta} &larr;</a></div>
  <div style="margin-top:26px;padding-top:14px;border-top:1px solid #efede8;color:#9a958c;font-size:12px;font-family:${FONT}">המייל נשלח אוטומטית ממכונת הלידים של ${esc(portal.name)}. אפשר לכבות התראות במסך ההגדרות.</div>
</div></body></html>`;
}

const row = (label: string, value: string) =>
  value ? `<tr><td style="padding:5px 0 5px 14px;color:#8c8777;font-size:14px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:5px 0;color:#111111;font-size:15px">${esc(value)}</td></tr>` : "";

async function send(portal: FunnelPortal, subject: string, html: string): Promise<boolean> {
  if (!portal.ownerEmail) return false;
  try {
    const res = await resend.emails.send({ from: FROM, to: portal.ownerEmail, subject, html });
    if (res.error) { console.error("[PortalNotify] send failed:", res.error.message); return false; }
    return true;
  } catch (err) {
    console.error("[PortalNotify] exception:", err instanceof Error ? err.message : err);
    return false;
  }
}

export interface LeadInfo { name?: string; email?: string; phone?: string; business?: string; source?: string }

/** התראת ליד חדש — נשלחת פעם אחת לכל שיחה, ברגע שהליד השאיר פרט קשר ראשון */
export async function notifyNewLead(chatId: string, lead: LeadInfo): Promise<void> {
  const chat = await prisma.prospectChat.findUnique({ where: { id: chatId }, select: { portalId: true, leadNotifiedAt: true, source: true } });
  if (!chat || chat.leadNotifiedAt) return;
  if (!lead.source) {
    try { lead = { ...lead, source: sourceLabel(JSON.parse(chat.source || "{}")) }; } catch { /* בלי מקור */ }
  }
  const portal = chat.portalId
    ? await prisma.funnelPortal.findUnique({ where: { id: chat.portalId } })
    : await prisma.funnelPortal.findFirst({ where: { isDefault: true, deletedAt: null } });
  if (!portal || portal.deletedAt || !portal.notifyLead || !portal.ownerEmail) return;

  // סימון אטומי: רק מי שהצליח לסמן שולח, שלא ייצאו שתי התראות על אותו ליד
  const claimed = await prisma.prospectChat.updateMany({ where: { id: chatId, leadNotifiedAt: null }, data: { leadNotifiedAt: new Date() } });
  if (claimed.count !== 1) return;

  const mail = renderNewLead(portal, lead);
  await send(portal, mail.subject, mail.html);
}

export function renderNewLead(portal: FunnelPortal, lead: LeadInfo): { subject: string; html: string } {
  const who = lead.name || "ליד חדש";
  return { subject: `ליד חדש: ${who}${lead.business ? ` · ${lead.business}` : ""}`, html: shell(
    "ליד חדש השאיר פרטים",
    `<p style="margin:0 0 12px">מישהו סיים עכשיו שיחה עם הסוכן שלך והשאיר פרטים. ליד שמקבל מענה מהר נסגר הרבה יותר.</p>
     <table dir="rtl" style="border-collapse:collapse;direction:rtl">
       ${row("שם", lead.name ?? "")}${row("עסק / תחום", lead.business ?? "")}${row("טלפון", lead.phone ?? "")}${row("מייל", lead.email ?? "")}${row("הגיע מ", lead.source ?? "")}
     </table>`,
    portal, "לצפייה בליד ובשיחה",
  ) };
}

/** התראת פגישה שנקבעה */
export async function notifyMeetingBooked(chatId: string, lead: LeadInfo, meetingAtIso: string): Promise<void> {
  const chat = await prisma.prospectChat.findUnique({ where: { id: chatId }, select: { portalId: true } });
  if (!chat) return;
  const portal = chat.portalId
    ? await prisma.funnelPortal.findUnique({ where: { id: chat.portalId } })
    : await prisma.funnelPortal.findFirst({ where: { isDefault: true, deletedAt: null } });
  if (!portal || portal.deletedAt || !portal.notifyMeeting || !portal.ownerEmail) return;

  const when = new Date(meetingAtIso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  await send(portal, `פגישה חדשה נקבעה: ${lead.name ?? "ליד"} · ${when}`, shell(
    "נקבעה פגישה חדשה",
    `<p style="margin:0 0 12px">הסוכן קבע פגישה ביומן שלך.</p>
     <table dir="rtl" style="border-collapse:collapse;direction:rtl">
       ${row("מתי", when)}${row("שם", lead.name ?? "")}${row("עסק / תחום", lead.business ?? "")}${row("טלפון", lead.phone ?? "")}${row("מייל", lead.email ?? "")}
     </table>`,
    portal, "לצפייה בליד ובשיחה",
  ));
}

export interface WeeklyNumbers {
  chats: number; leads: number; meetings: number; closed: number; sales: number;
  spend: number | null; cpl: number | null;
  openEscalations: number; dueActions: number;
  summary: string; recommendations: string[];
}

const stat = (label: string, value: string) =>
  `<td style="padding:10px 12px;border:1px solid #efede8;text-align:center;vertical-align:top"><div style="color:#b8860b;font-size:22px;font-weight:600">${value}</div><div style="color:#8c8777;font-size:12.5px;margin-top:2px">${label}</div></td>`;

/** הדוח השבועי לבעל הפורטל — מה קרה במכונה בשבוע האחרון */
/** מייל כללי לבעל הפורטל, בתבנית הקבועה של המערכת */
export async function sendPortalEmail(portal: FunnelPortal, subject: string, title: string, innerHtml: string): Promise<boolean> {
  return send(portal, subject, shell(title, innerHtml, portal));
}

export async function sendWeeklyReport(portal: FunnelPortal, n: WeeklyNumbers, from: string, to: string): Promise<boolean> {
  const mail = renderWeeklyReport(portal, n, from, to);
  return send(portal, mail.subject, mail.html);
}

export function renderWeeklyReport(portal: FunnelPortal, n: WeeklyNumbers, from: string, to: string): { subject: string; html: string } {
  const fmt = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
  const ils = (v: number) => `${Math.round(v).toLocaleString("he-IL")} ₪`;
  const todo: string[] = [];
  if (n.dueActions > 0) todo.push(`${n.dueActions} לידים מחכים לפעולת המשך שלך`);
  if (n.openEscalations > 0) todo.push(`${n.openEscalations} שאלות שהסוכן לא ידע לענות עליהן מחכות לתשובה`);

  const inner = `
    <p style="margin:0 0 14px">סיכום השבוע, ${fmt(from)} עד ${fmt(to)}:</p>
    <table dir="rtl" style="border-collapse:collapse;direction:rtl;width:100%"><tr>
      ${stat("שיחות עם הסוכן", String(n.chats))}${stat("השאירו פרטים", String(n.leads))}${stat("פגישות נקבעו", String(n.meetings))}${stat("עסקאות נסגרו", String(n.closed))}
    </tr></table>
    ${n.sales > 0 || n.spend !== null ? `<p style="margin:14px 0 0">${[
      n.sales > 0 ? `שווי העסקאות שנסגרו: <b>${ils(n.sales)}</b>` : "",
      n.spend !== null ? `השקעה בפרסום: <b>${ils(n.spend)}</b>` : "",
      n.cpl !== null ? `עלות לליד: <b>${ils(n.cpl)}</b>` : "",
    ].filter(Boolean).join(" · ")}</p>` : ""}
    ${n.summary ? `<div style="border-right:3px solid #eed89b;padding:2px 14px 2px 0;margin:18px 0"><div style="color:#8c8777;font-size:13px">מה עלה מהשיחות השבוע</div><div style="margin-top:3px">${esc(n.summary)}</div></div>` : ""}
    ${n.recommendations.length ? `<div style="margin-top:6px"><div style="color:#8c8777;font-size:13px;margin-bottom:4px">המלצות</div>${n.recommendations.slice(0, 3).map((r) => `<div style="margin-bottom:4px">• ${esc(r)}</div>`).join("")}</div>` : ""}
    ${todo.length ? `<div style="background:#faf6e9;border-radius:10px;padding:12px 16px;margin-top:18px"><b>מחכה לך במערכת:</b>${todo.map((t) => `<div style="margin-top:4px">• ${t}</div>`).join("")}</div>` : ""}`;

  return { subject: `הסיכום השבועי של מכונת הלידים · ${fmt(from)} עד ${fmt(to)}`, html: shell("הסיכום השבועי שלך", inner, portal) };
}
