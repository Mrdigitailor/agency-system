// ה-API של פורטל הלקוח העצמאי — המוצר שהלקוח מקבל.
// גישה: קישור ייחודי + סיסמה (ראו portal-auth). "demo" פתוח ומגיש נתוני הדגמה, בלי לשמור כלום.
// כל שאילתה ועדכון מוגבלים לפורטל שמבקש: לקוח רואה ומשנה רק את הנתונים שלו.
// GET:   ?view=leads|customers|results|escalations|knowledge|insights|settings|mailing(&key=), או ?id= לפירוט ליד
// POST:  kind=customer (ברירת מחדל) | note | knowledge | insights | emailVersion | emailPreview | emailAdvice
// PATCH: kind=status (ברירת מחדל) | customer | relevant | escalation | nextAction | noShow | note | knowledge | settings | emailEnabled
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  loadFunnel, loadFunnelDetail, loadResults, loadBusinessMetrics, chatInScope,
  FUNNEL_STATUS_OPTIONS, CUSTOMER_STAGES,
} from "@/lib/prospect/funnel-data";
import {
  DEMO_ROWS, DEMO_STATS, demoDetail, DEMO_CUSTOMERS, DEMO_ESCALATIONS, DEMO_KNOWLEDGE, DEMO_INSIGHT,
  demoResults, demoBusinessMetrics,
} from "@/lib/prospect/demo-data";
import { requirePortal } from "@/lib/prospect/portal-auth";
import { generateInsights, latestInsight, MIN_CHATS_FOR_INSIGHTS, REGENERATE_HOURS } from "@/lib/prospect/portal-insights";
import { todayIL, monthStartIL, shiftYmd } from "@/lib/utils/ildate";
import {
  loadMailing, loadMailingDetail, saveEmailVersion, setEmailEnabled, previewEmail, generateEmailAdvice, ADVICE_HOURS,
} from "@/lib/prospect/mailing";
import { specOf, EMAIL_GROUPS, type EmailKey } from "@/lib/prospect/email-templates";
import { sendProspectEmail } from "@/lib/prospect/emails";
import { DEMO_MAILING, demoMailingDetail } from "@/lib/prospect/demo-mailing";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // יצירת תובנות קוראת ל-Claude

const DEAL_TYPES = ["one_time", "retainer", "setup_retainer", "percent"];
const NOTE_KINDS = ["note", "call", "whatsapp", "email"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const EMPTY_RESULTS = { hasData: false, totals: { spend: 0, impressions: 0, clicks: 0, cpc: 0, leads: 0, cpl: 0, convRate: 0 }, daily: [], campaigns: [], terms: [] };

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await requirePortal(req, token);
  if (!access.ok) return access.response;
  const { demo, portal } = access;

  const url = new URL(req.url);
  const appBase = process.env.APP_BASE_URL ?? url.origin;
  const id = url.searchParams.get("id");
  const view = url.searchParams.get("view") ?? "leads";
  const days = Number(url.searchParams.get("days")) || 30;

  if (id) {
    const detail = demo ? demoDetail(id) : await loadFunnelDetail(id, appBase, portal);
    if (!detail) return bad("not found", 404);
    return NextResponse.json(detail);
  }

  if (view === "customers") {
    if (demo) return NextResponse.json({ customers: DEMO_CUSTOMERS, stages: CUSTOMER_STAGES });
    const customers = await prisma.portalCustomer.findMany({ where: { portalId: portal.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ customers, stages: CUSTOMER_STAGES });
  }

  if (view === "results") {
    // טווח תאריכים: from/to בפורמט YYYY-MM-DD; ברירת מחדל = החודש הנוכחי. תקרה של שנה.
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    let to = url.searchParams.get("to") ?? "";
    let from = url.searchParams.get("from") ?? "";
    if (!YMD.test(to)) to = todayIL();
    if (!YMD.test(from)) from = monthStartIL();
    if (from > to) from = to;
    if (from < shiftYmd(to, -365)) from = shiftYmd(to, -365);

    if (demo) {
      const r = demoResults(from, to);
      return NextResponse.json({ ...r, from, to, business: demoBusinessMetrics(r.totals.spend) });
    }
    const business = await loadBusinessMetrics(portal, portal.clientId, from, to);
    const results = portal.clientId ? await loadResults(portal.clientId, from, to) : EMPTY_RESULTS;
    return NextResponse.json({ ...results, from, to, business });
  }

  if (view === "escalations") {
    if (demo) return NextResponse.json({ escalations: DEMO_ESCALATIONS });
    const rows = await prisma.chatEscalation.findMany({
      where: portal.isDefault ? { OR: [{ portalId: portal.id }, { portalId: null }] } : { portalId: portal.id },
      orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 100,
    });
    const chatIds = [...new Set(rows.map((r) => r.chatId))];
    const chats = chatIds.length ? await prisma.prospectChat.findMany({ where: { id: { in: chatIds } } }) : [];
    const nameByChat = new Map(chats.map((c) => {
      try { const f = JSON.parse(c.fields || "{}"); return [c.id, [f.name, f.businessName || f.serviceField].filter(Boolean).join(" · ") || "אנונימי"]; }
      catch { return [c.id, "אנונימי"]; }
    }));
    return NextResponse.json({
      escalations: rows.map((r) => ({
        id: r.id, chatId: r.chatId, chatName: nameByChat.get(r.chatId) ?? "אנונימי",
        question: r.question, status: r.status, answer: r.answer, createdAt: r.createdAt,
      })),
    });
  }

  if (view === "knowledge") {
    if (demo) return NextResponse.json({ items: DEMO_KNOWLEDGE });
    const items = await prisma.portalKnowledge.findMany({ where: { portalId: portal.id, deletedAt: null }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ items: items.map((k) => ({ id: k.id, title: k.title, content: k.content, source: k.source, updatedAt: k.updatedAt })) });
  }

  if (view === "insights") {
    if (demo) return NextResponse.json({ insight: DEMO_INSIGHT, canGenerate: false, minChats: MIN_CHATS_FOR_INSIGHTS });
    const insight = await latestInsight(portal.id);
    const canGenerate = !insight || Date.now() - new Date(insight.createdAt).getTime() > REGENERATE_HOURS * 3600_000;
    return NextResponse.json({ insight, canGenerate, minChats: MIN_CHATS_FOR_INSIGHTS });
  }

  if (view === "mailing") {
    const key = url.searchParams.get("key");
    if (key) {
      if (!specOf(key)) return bad("not found", 404);
      const detail = demo ? demoMailingDetail(key as EmailKey) : await loadMailingDetail(portal, key as EmailKey);
      if (!detail) return bad("not found", 404);
      return NextResponse.json(detail);
    }
    return NextResponse.json({ emails: demo ? DEMO_MAILING : await loadMailing(portal), groups: EMAIL_GROUPS });
  }

  if (view === "settings") {
    if (demo) return NextResponse.json({ ownerEmail: "you@example.co.il", notifyLead: true, notifyMeeting: true, weeklyReport: true });
    return NextResponse.json({ ownerEmail: portal.ownerEmail, notifyLead: portal.notifyLead, notifyMeeting: portal.notifyMeeting, weeklyReport: portal.weeklyReport });
  }

  // view=leads
  if (demo) return NextResponse.json({ name: "העסק שלך", demo: true, rows: DEMO_ROWS, stats: DEMO_STATS, openEscalations: DEMO_ESCALATIONS.filter((e) => e.status === "open").length });
  const data = await loadFunnel(portal, days, appBase);
  const openEscalations = await prisma.chatEscalation.count({
    where: { status: "open", ...(portal.isDefault ? { OR: [{ portalId: portal.id }, { portalId: null }] } : { portalId: portal.id }) },
  });
  return NextResponse.json({ name: portal.name, demo: false, ...data, openEscalations });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await requirePortal(req, token);
  if (!access.ok) return access.response;
  const { demo, portal } = access;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("bad request"); }
  const kind = str(body.kind, 20) || "customer";

  // תיעוד על ליד: הערה, שיחה, וואטסאפ או מייל
  if (kind === "note") {
    const chatId = str(body.chatId, 40);
    const text = str(body.text, 2000);
    const noteKind = NOTE_KINDS.includes(String(body.noteKind)) ? String(body.noteKind) : "note";
    if (!chatId || !text) return bad("חסר תוכן");
    if (demo) return NextResponse.json({ ok: true, note: { id: `n-tmp-${Date.now()}`, kind: noteKind, text, createdAt: new Date().toISOString() } });
    if (!(await chatInScope(chatId, portal))) return bad("not found", 404);
    const note = await prisma.portalLeadNote.create({ data: { portalId: portal.id, chatId, kind: noteKind, text } });
    return NextResponse.json({ ok: true, note: { id: note.id, kind: note.kind, text: note.text, createdAt: note.createdAt } });
  }

  // פריט ידע חדש לסוכן
  if (kind === "knowledge") {
    const title = str(body.title, 200);
    const content = str(body.content, 2000);
    if (!title || !content) return bad("חסרים נושא ותוכן");
    if (demo) return NextResponse.json({ ok: true, item: { id: `kn-tmp-${Date.now()}`, title, content, source: "manual", updatedAt: new Date().toISOString() } });
    const item = await prisma.portalKnowledge.create({ data: { portalId: portal.id, title, content } });
    return NextResponse.json({ ok: true, item: { id: item.id, title: item.title, content: item.content, source: item.source, updatedAt: item.updatedAt } });
  }

  // ---- דיוור ----
  if (kind === "emailPreview" || kind === "emailVersion" || kind === "emailAdvice") {
    const key = str(body.key, 20);
    const spec = specOf(key);
    if (!spec) return bad("מייל לא מוכר", 404);
    const fields = (body.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, unknown>;

    // תצוגה מקדימה של טיוטה, עם ליד לדוגמה. לא שומרת כלום.
    if (kind === "emailPreview") {
      const base = demo ? demoMailingDetail(spec.key)!.fields : (await loadMailingDetail(portal, spec.key))!.fields;
      const mail = previewEmail(spec.key, fields, base);
      return NextResponse.json({ ok: true, subject: mail?.subject ?? "", html: mail?.html ?? "" });
    }

    // שמירת נוסח חדש כגרסה
    if (kind === "emailVersion") {
      if (demo) return NextResponse.json({ ok: true, version: demoMailingDetail(spec.key)!.version + 1, demo: true });
      const res = await saveEmailVersion(portal, spec.key, fields, str(body.changeNote, 300));
      return NextResponse.json({ ok: true, ...res });
    }

    // המלצות לשיפור (מוגבל בתדירות, אלא אם הנוסח השתנה)
    if (demo) return NextResponse.json({ ok: true, items: demoMailingDetail(spec.key)!.advice?.items ?? [] });
    const current = await loadMailingDetail(portal, spec.key);
    if (current && !current.canAdvise) return bad(`ההמלצות עודכנו לאחרונה. אפשר לבקש חדשות אחרי שינוי בנוסח, או בעוד ${ADVICE_HOURS} שעות.`, 429);
    try {
      return NextResponse.json({ ok: true, items: await generateEmailAdvice(portal, spec.key) });
    } catch (err) {
      console.error("[Mailing] advice failed:", err instanceof Error ? err.message : err);
      return bad("הפקת ההמלצות נכשלה, נסו שוב בעוד כמה דקות", 502);
    }
  }

  // יצירת תובנות מהשיחות של 30 הימים האחרונים (מוגבל בתדירות)
  if (kind === "insights") {
    if (demo) return NextResponse.json({ ok: true, insight: DEMO_INSIGHT });
    const last = await latestInsight(portal.id);
    if (last && Date.now() - new Date(last.createdAt).getTime() < REGENERATE_HOURS * 3600_000) {
      return bad("התובנות עודכנו לאחרונה, אפשר לרענן שוב מאוחר יותר", 429);
    }
    try {
      const to = todayIL();
      const insight = await generateInsights(portal, shiftYmd(to, -29), to);
      if (!insight) return NextResponse.json({ ok: false, tooFew: true, minChats: MIN_CHATS_FOR_INSIGHTS });
      return NextResponse.json({ ok: true, insight });
    } catch (err) {
      console.error("[PortalInsights] generate failed:", err instanceof Error ? err.message : err);
      return bad("יצירת התובנות נכשלה, נסו שוב בעוד כמה דקות", 502);
    }
  }

  // סגירת עסקה / לקוח חדש
  const name = str(body.name);
  if (!name) return bad("חסר שם");
  const stage = str(body.stage) || "חדש";
  if (!CUSTOMER_STAGES.includes(stage)) return bad("שלב לא מוכר");
  const dealType = DEAL_TYPES.includes(String(body.dealType)) ? String(body.dealType) : "one_time";
  const sourceChatId = str(body.sourceChatId, 40) || null;
  const deal = {
    dealType,
    amountPaid: dealType === "one_time" || dealType === "setup_retainer" ? num(body.amountPaid) : 0,
    monthlyFee: dealType === "retainer" || dealType === "setup_retainer" ? num(body.monthlyFee) : 0,
    percentRate: dealType === "percent" ? Math.min(num(body.percentRate), 100) : 0,
    paid: body.paid === true,
  };
  const base = { name, business: str(body.business), email: str(body.email), phone: str(body.phone, 50), stage, notes: str(body.notes, 2000) };

  // בדמו מאשרים בלי לשמור — ההדגמה חוזרת נקייה
  if (demo) return NextResponse.json({ ok: true, customer: { id: `dc-tmp-${Date.now()}`, ...base, ...deal, createdAt: new Date().toISOString(), sourceChatId } });

  if (sourceChatId) {
    if (!(await chatInScope(sourceChatId, portal))) return bad("not found", 404);
    const existing = await prisma.portalCustomer.findFirst({ where: { portalId: portal.id, sourceChatId } });
    if (existing) return NextResponse.json({ ok: true, customer: existing, existed: true });
  }
  const customer = await prisma.portalCustomer.create({ data: { portalId: portal.id, ...base, ...deal, sourceChatId } });
  // ליד שהפך ללקוח מסומן אוטומטית כ"נסגר" במשפך
  if (sourceChatId) await prisma.prospectChat.update({ where: { id: sourceChatId }, data: { funnelStatus: "נסגר" } }).catch(() => {});
  return NextResponse.json({ ok: true, customer });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await requirePortal(req, token);
  if (!access.ok) return access.response;
  const { demo, portal } = access;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("bad request"); }
  const kind = str(body.kind, 20) || "status";
  const id = str(body.id, 40);

  // הגדרות הפורטל: מייל להתראות ומתגים
  if (kind === "settings") {
    const data: Record<string, unknown> = {};
    if (typeof body.ownerEmail === "string") {
      const email = body.ownerEmail.trim().toLowerCase().slice(0, 200);
      if (email && !EMAIL_RE.test(email)) return bad("כתובת מייל לא תקינה");
      data.ownerEmail = email;
    }
    for (const k of ["notifyLead", "notifyMeeting", "weeklyReport"] as const) {
      if (typeof body[k] === "boolean") data[k] = body[k];
    }
    if (demo) return NextResponse.json({ ok: true });
    await prisma.funnelPortal.update({ where: { id: portal.id }, data: data as never });
    return NextResponse.json({ ok: true });
  }

  // הפעלה או כיבוי של מייל ברצף
  if (kind === "emailEnabled") {
    const spec = specOf(str(body.key, 20));
    if (!spec || typeof body.enabled !== "boolean") return bad("בקשה לא תקינה");
    if (!demo) await setEmailEnabled(portal, spec.key, body.enabled);
    return NextResponse.json({ ok: true, enabled: body.enabled });
  }

  if (!id) return bad("חסר מזהה");

  if (kind === "customer") {
    const data: Record<string, unknown> = {};
    if (typeof body.stage === "string") {
      if (!CUSTOMER_STAGES.includes(body.stage)) return bad("שלב לא מוכר");
      data.stage = body.stage;
    }
    if (typeof body.dealType === "string") {
      if (!DEAL_TYPES.includes(body.dealType)) return bad("סוג עסקה לא מוכר");
      data.dealType = body.dealType;
    }
    if (typeof body.paid === "boolean") data.paid = body.paid;
    if (body.amountPaid !== undefined) data.amountPaid = num(body.amountPaid);
    if (body.monthlyFee !== undefined) data.monthlyFee = num(body.monthlyFee);
    if (body.percentRate !== undefined) data.percentRate = Math.min(num(body.percentRate), 100);
    if (typeof body.notes === "string") data.notes = body.notes.trim().slice(0, 2000);
    if (typeof body.name === "string" && body.name.trim()) data.name = str(body.name);
    if (typeof body.business === "string") data.business = str(body.business);
    if (typeof body.phone === "string") data.phone = str(body.phone, 50);
    if (typeof body.email === "string") data.email = str(body.email);
    if (demo) return NextResponse.json({ ok: true });
    const res = await prisma.portalCustomer.updateMany({ where: { id, portalId: portal.id }, data: data as never });
    if (res.count === 0) return bad("not found", 404);
    return NextResponse.json({ ok: true });
  }

  // תשובת מנהל לאסקלציה — נשמרת גם כפריט ידע, וכך נכנסת לסוכן בשיחות הבאות
  if (kind === "escalation") {
    const answer = str(body.answer, 2000);
    if (!answer) return bad("חסרה תשובה");
    if (demo) return NextResponse.json({ ok: true });
    const esc = await prisma.chatEscalation.findFirst({
      where: { id, ...(portal.isDefault ? { OR: [{ portalId: portal.id }, { portalId: null }] } : { portalId: portal.id }) },
    });
    if (!esc) return bad("not found", 404);
    await prisma.chatEscalation.update({ where: { id }, data: { answer, status: "answered", answeredAt: new Date() } });
    const existing = await prisma.portalKnowledge.findFirst({ where: { portalId: portal.id, escalationId: id } });
    if (existing) await prisma.portalKnowledge.update({ where: { id: existing.id }, data: { content: answer, deletedAt: null } });
    else await prisma.portalKnowledge.create({ data: { portalId: portal.id, title: esc.question.slice(0, 200), content: answer, source: "escalation", escalationId: id } });
    return NextResponse.json({ ok: true });
  }

  // עריכה או הסרה (רכה) של פריט ידע
  if (kind === "knowledge") {
    const data: Record<string, unknown> = {};
    if (body.remove === true) data.deletedAt = new Date();
    else {
      const title = str(body.title, 200);
      const content = str(body.content, 2000);
      if (!title || !content) return bad("חסרים נושא ותוכן");
      data.title = title; data.content = content;
    }
    if (demo) return NextResponse.json({ ok: true });
    const res = await prisma.portalKnowledge.updateMany({ where: { id, portalId: portal.id }, data: data as never });
    if (res.count === 0) return bad("not found", 404);
    return NextResponse.json({ ok: true });
  }

  // הסרה (רכה) של תיעוד על ליד
  if (kind === "note") {
    if (demo) return NextResponse.json({ ok: true });
    const res = await prisma.portalLeadNote.updateMany({ where: { id, portalId: portal.id }, data: { deletedAt: new Date() } });
    if (res.count === 0) return bad("not found", 404);
    return NextResponse.json({ ok: true });
  }

  // מכאן: פעולות על ליד (שיחה). כולן מותנות בכך שהשיחה שייכת לפורטל.
  if (!demo && !(await chatInScope(id, portal))) return bad("not found", 404);

  // הליד לא הגיע לפגישה שקבע: מסמנים, ושולחים לו מייל לבחירת מועד חדש
  if (kind === "noShow") {
    if (demo) return NextResponse.json({ ok: true, emailed: true });
    const chat = await prisma.prospectChat.findUnique({ where: { id }, select: { reportId: true } });
    const report = chat?.reportId ? await prisma.potentialReport.findUnique({ where: { id: chat.reportId } }) : null;
    if (!report?.meetingAt || report.cancelledAt) return bad("אין לליד הזה פגישה שנקבעה");
    if (report.meetingAt.getTime() > Date.now()) return bad("הפגישה עוד לא התקיימה");
    if (report.noShowAt && report.noShowAt > report.meetingAt) return NextResponse.json({ ok: true, emailed: false, already: true });
    await prisma.potentialReport.update({ where: { id: report.id }, data: { noShowAt: new Date() } });
    const emailed = await sendProspectEmail(report.id, "noshow");
    return NextResponse.json({ ok: true, emailed });
  }

  if (kind === "relevant") {
    const relevant = typeof body.relevant === "string" && ["yes", "no", ""].includes(body.relevant) ? body.relevant : null;
    if (relevant === null) return bad("ערך לא תקין");
    if (!demo) await prisma.prospectChat.update({ where: { id }, data: { relevant } });
    return NextResponse.json({ ok: true, relevant });
  }

  // משימת המשך: מתי ומה. תאריך ריק מנקה את המשימה.
  if (kind === "nextAction") {
    const note = str(body.note, 300);
    let at: Date | null = null;
    if (typeof body.at === "string" && body.at) {
      at = new Date(body.at);
      if (isNaN(at.getTime())) return bad("תאריך לא תקין");
    }
    if (!demo) await prisma.prospectChat.update({ where: { id }, data: { nextActionAt: at, nextActionNote: at ? note : "" } });
    return NextResponse.json({ ok: true, nextActionAt: at, nextActionNote: at ? note : "" });
  }

  // kind=status
  const funnelStatus = typeof body.funnelStatus === "string" ? body.funnelStatus.trim().slice(0, 40) : null;
  if (funnelStatus === null || (funnelStatus !== "" && !FUNNEL_STATUS_OPTIONS.includes(funnelStatus))) return bad("בקשה לא תקינה");
  if (!demo) await prisma.prospectChat.update({ where: { id }, data: { funnelStatus } });
  return NextResponse.json({ ok: true, funnelStatus });
}
