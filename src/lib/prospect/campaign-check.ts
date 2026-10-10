// בדיקת הקמפיין של המשפך: רצה כל יומיים ושולחת לבעל הפורטל מייל עם המספרים ועם מה שהם אומרים.
// הבדיקה רק קוראת ומדווחת. היא לא משנה שום דבר בחשבון: כל שינוי בתקציב או בתקרה דורש אישור של בעל החשבון.
import type { FunnelPortal } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { gadsSearch } from "@/lib/kit/google-ads";
import { chatScope } from "./funnel-data";
import { sendPortalEmail } from "./portal-notify";
import { todayIL, shiftYmd } from "@/lib/utils/ildate";

const OWN_ACCOUNT = "3798644658";
const CAMPAIGN_PREFIX = "משפך |";

type Row = Record<string, Record<string, unknown>>;
const num = (v: unknown) => Number(v ?? 0) || 0;
const nis = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;
const pct = (v: unknown) => (v === undefined || v === null ? "אין נתון" : `${Math.round(num(v) * 100)}%`);

/** חשבון הגוגל אדס של הפורטל: שלנו לפורטל ברירת המחדל, ושל הלקוח המקושר לכל פורטל אחר */
async function accountOf(portal: FunnelPortal): Promise<string | null> {
  if (portal.isDefault) return OWN_ACCOUNT;
  if (!portal.clientId) return null;
  const asset = await prisma.platformAsset.findFirst({
    where: { assetType: "google_ads_account", isSelected: true, connection: { clientId: portal.clientId, platform: "google_ads" } },
    select: { externalId: true },
  });
  return asset ? asset.externalId.replace(/\D/g, "") : null;
}

interface Period { impressions: number; clicks: number; cost: number; cpc: number; share: unknown; lostRank: unknown; lostBudget: unknown; top: unknown }

async function period(cid: string, campaignId: string, from: string, to: string): Promise<Period> {
  const rows = (await gadsSearch(cid, `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.search_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share, metrics.search_top_impression_share FROM campaign WHERE campaign.id = ${campaignId} AND segments.date BETWEEN '${from}' AND '${to}'`)) as Row[];
  const m = rows[0]?.metrics ?? {};
  const clicks = num(m.clicks), cost = num(m.costMicros) / 1e6;
  return { impressions: num(m.impressions), clicks, cost, cpc: clicks ? cost / clicks : 0, share: m.searchImpressionShare, lostRank: m.searchRankLostImpressionShare, lostBudget: m.searchBudgetLostImpressionShare, top: m.searchTopImpressionShare };
}

export async function runCampaignCheck(portal: FunnelPortal): Promise<string> {
  const cid = await accountOf(portal);
  if (!cid) return "אין חשבון גוגל אדס מקושר";

  const campaigns = (await gadsSearch(cid, `SELECT campaign.id, campaign.name, campaign.primary_status, campaign_budget.amount_micros, campaign.target_spend.cpc_bid_ceiling_micros FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.name LIKE '${CAMPAIGN_PREFIX}%'`)) as Row[];
  if (!campaigns.length) return "אין קמפיין פעיל של המשפך";

  const today = todayIL(), yesterday = shiftYmd(today, -1);
  const sections: string[] = [];
  let subjectLine = "";

  for (const c of campaigns) {
    const id = String(c.campaign.id), name = String(c.campaign.name);
    const daily = num(c.campaignBudget?.amountMicros) / 1e6;
    const ceiling = num((c.campaign.targetSpend as Record<string, unknown> | undefined)?.cpcBidCeilingMicros) / 1e6;

    // היום הראשון עם חשיפות = יום ההשקה
    const days = (await gadsSearch(cid, `SELECT segments.date, metrics.impressions FROM campaign WHERE campaign.id = ${id} AND segments.date DURING LAST_30_DAYS AND metrics.impressions > 0 ORDER BY segments.date`)) as Row[];
    const launch = days.length ? String(days[0].segments.date) : today;
    const daysLive = Math.max(1, Math.round((Date.parse(today) - Date.parse(launch)) / 86_400_000));

    const last2 = await period(cid, id, shiftYmd(today, -2), yesterday);
    const last4 = await period(cid, id, shiftYmd(today, -4), yesterday);
    const all = await period(cid, id, launch, today);

    const convRows = (await gadsSearch(cid, `SELECT segments.conversion_action_name, metrics.all_conversions FROM campaign WHERE campaign.id = ${id} AND segments.date BETWEEN '${launch}' AND '${today}'`)) as Row[];
    const conversions = convRows.map((r) => [String(r.segments.conversionActionName), num(r.metrics.allConversions)] as const).filter(([, n]) => n > 0);
    const leadConversions = conversions.filter(([n]) => n.includes("השאיר פרטים")).reduce((s, [, n]) => s + n, 0);

    const termRows = (await gadsSearch(cid, `SELECT search_term_view.search_term, metrics.clicks, metrics.impressions FROM search_term_view WHERE campaign.id = ${id} AND segments.date BETWEEN '${launch}' AND '${today}' AND metrics.clicks > 0 ORDER BY metrics.clicks DESC LIMIT 12`)) as Row[];

    // המשפך עצמו, מהמערכת שלנו: מי שהגיע מגוגל מאז ההשקה
    const chats = await prisma.prospectChat.findMany({
      where: { ...chatScope({ id: portal.id, isDefault: portal.isDefault }), createdAt: { gte: new Date(`${launch}T00:00:00+03:00`) }, OR: [{ source: { contains: "gclid" } }, { source: { contains: "utm_source\":\"google" } }] },
      select: { fields: true, reportId: true },
    });
    const withContact = chats.filter((ch) => /"(email|phone)":"/.test(ch.fields)).length;
    const reportIds = chats.map((ch) => ch.reportId).filter((x): x is string => Boolean(x));
    const meetings = reportIds.length ? await prisma.potentialReport.count({ where: { id: { in: reportIds }, bookedAt: { not: null } } }) : 0;

    // מה זה אומר, לפי ההנחיות של המשפך
    const notes: string[] = [];
    const use4 = daily ? last4.cost / (daily * Math.min(4, daysLive)) : 0;
    if (all.impressions === 0) notes.push("הקמפיין עוד לא קיבל חשיפות. אם זה נמשך יותר מיומיים, צריך לבדוק שהמודעה מאושרת ושהתקרה לא נמוכה מדי.");
    else if (daysLive <= 7) notes.push(`השבוע הראשון (יום ${daysLive} מתוך 7): עוד לא שופטים ולא משנים. ההתחלה תמיד איטית.`);
    else {
      if (use4 < 0.7) notes.push(`בארבעת הימים האחרונים נוצלו רק ${Math.round(use4 * 100)}% מהתקציב. לפי ההנחיות, ההצעה היא להעלות את תקרת המחיר לקליק ב-10% (מ-${ceiling.toFixed(0)} ₪ ל-${(ceiling * 1.1).toFixed(0)} ₪). זה דורש אישור שלך.`);
      if (num(last4.lostRank) > 0.4) notes.push(`${pct(last4.lostRank)} מהחשיפות האפשריות אבדו בגלל דירוג. המודעה מופיעה פחות ממה שהיא יכולה.`);
      if (num(last4.lostBudget) > 0.2) notes.push(`${pct(last4.lostBudget)} מהחשיפות אבדו בגלל תקציב. יש ביקוש שהתקציב הנוכחי לא מכסה.`);
      if (all.clicks >= 40 && withContact === 0) notes.push(`${all.clicks} קליקים ועדיין אף אחד לא השאיר פרטים. שווה לבדוק את דף הנחיתה ואת פתיחת הצ'אט.`);
    }
    if (withContact > 0 && leadConversions === 0) notes.push(`במערכת שלנו ${withContact} אנשים שהגיעו מגוגל השאירו פרטים, אבל בגוגל אדס לא נרשמה אף המרה של "השאיר פרטים". צריך לבדוק את המדידה.`);
    if (withContact > 0 && leadConversions > 0) notes.push("המדידה עובדת: השארות פרטים נרשמות גם בגוגל אדס.");
    if (termRows.some((r) => num(r.metrics.clicks) >= 3)) notes.push("יש מונחי חיפוש עם 3 קליקים ומעלה. הגיע הזמן למעבר השבועי: מה להוסיף ומה להחריג.");

    const tr = (label: string, a: string, b: string) => `<tr><td style="padding:6px 0 6px 12px;color:#8c8777;font-size:14px">${label}</td><td style="padding:6px 12px;color:#111;font-size:15px">${a}</td><td style="padding:6px 0;color:#111;font-size:15px">${b}</td></tr>`;
    sections.push(`
      <p style="margin:0 0 10px"><b>${name}</b><br><span style="color:#8c8777;font-size:14px">יום ${daysLive} מאז ההשקה · תקציב ${nis(daily)} ליום · תקרה ${ceiling.toFixed(0)} ₪ לקליק</span></p>
      <table dir="rtl" style="border-collapse:collapse;direction:rtl;margin:0 0 16px">
        <tr><td></td><td style="padding:0 12px 4px;color:#8c8777;font-size:13px">יומיים אחרונים</td><td style="padding:0 0 4px;color:#8c8777;font-size:13px">מאז ההשקה</td></tr>
        ${tr("חשיפות", last2.impressions.toLocaleString("he-IL"), all.impressions.toLocaleString("he-IL"))}
        ${tr("קליקים", String(last2.clicks), String(all.clicks))}
        ${tr("הוצאה", nis(last2.cost), nis(all.cost))}
        ${tr("מחיר לקליק", last2.clicks ? `${last2.cpc.toFixed(1)} ₪` : "אין", all.clicks ? `${all.cpc.toFixed(1)} ₪` : "אין")}
        ${tr("נתח חשיפות", pct(last2.share), pct(all.share))}
        ${tr("אבד בגלל דירוג", pct(last2.lostRank), pct(all.lostRank))}
        ${tr("אבד בגלל תקציב", pct(last2.lostBudget), pct(all.lostBudget))}
        ${tr("הופעה בראש העמוד", pct(last2.top), pct(all.top))}
      </table>
      <p style="margin:0 0 6px"><b>המשפך, מאז ההשקה</b> (מי שהגיע מגוגל)</p>
      <p style="margin:0 0 16px">נכנסו לצ'אט: ${chats.length} · השאירו פרטים: ${withContact} · קבעו פגישה: ${meetings}</p>
      <p style="margin:0 0 6px"><b>המרות שנרשמו בגוגל אדס</b></p>
      <p style="margin:0 0 16px">${conversions.length ? conversions.map(([n, v]) => `${n}: ${Math.round(v)}`).join("<br>") : "עוד לא נרשמו המרות."}</p>
      <p style="margin:0 0 6px"><b>מה אנשים הקלידו</b> (מונחים שקיבלו קליק)</p>
      <p style="margin:0 0 16px">${termRows.length ? termRows.map((r) => `${String(r.searchTermView.searchTerm)} · ${num(r.metrics.clicks)} קליקים`).join("<br>") : "עוד אין מונחים עם קליקים."}</p>
      <p style="margin:0 0 6px"><b>מה זה אומר</b></p>
      <ul style="margin:0 0 6px;padding:0 18px 0 0">${notes.map((n) => `<li style="margin-bottom:6px">${n}</li>`).join("")}</ul>`);
    subjectLine = `${last2.clicks} קליקים ביומיים, ${withContact} פניות מאז ההשקה`;
  }

  const ok = await sendPortalEmail(portal, `בדיקת קמפיין: ${subjectLine}`, "בדיקת הקמפיין של המשפך", sections.join('<hr style="border:0;border-top:1px solid #efede8;margin:18px 0">'));
  return ok ? "נשלח" : "השליחה נכשלה";
}
