// אגרגציה שבועית של נתוני קמפיינים ללקוח — מכל הפלטפורמות הפעילות.
// מחזיר סיכומים כוללים, פילוח לפי פלטפורמה, ופילוח לפי קמפיין (לדוחות פר-מוצר).

import { prisma } from "@/lib/db/prisma";
import { countConversions, categorizeSelectedConversions } from "@/lib/utils/metaMetrics";
import { countGoogleConversions } from "@/lib/utils/googleMetrics";

/** סוג התוצאה של הקמפיין — נגזר ממטרת האופטימיזציה + הנתונים בפועל */
export type CampaignResult = "purchases" | "leads" | "messages" | "unknown";

export interface CampaignRow {
  platform: "meta" | "google" | "tiktok";
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
  /** רכישות בפועל (מטא) — נפרד מהמרות/לידים; 0 לפלטפורמות אחרות */
  purchases: number;
  /** מה הקמפיין מנסה להשיג — כדי להציג את התוצאה הנכונה (לידים מול רכישות) */
  resultType: CampaignResult;
}

/** מזהה את סוג התוצאה של קמפיין מטא ממטרת האופטימיזציה + הנתונים */
function classifyCampaignResult(objective: string, conversions: number, purchases: number): CampaignResult {
  const obj = objective.toUpperCase();
  if (obj.includes("SALES") || obj.includes("PURCHASE")) return "purchases";
  if (obj.includes("ENGAGEMENT") || obj.includes("MESSAGE")) return "messages";
  // מבוסס-דאטה: אם יש יותר רכישות מלידים — זה קמפיין רכישות (גם אם המטרה מסומנת אחרת)
  if (purchases > 0 && purchases >= conversions) return "purchases";
  if (obj.includes("LEAD") || conversions > 0) return "leads";
  return "unknown";
}

export interface PlatformTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
}

export interface WeeklyClientData {
  weekStart: string;
  weekEnd: string;
  selectedEvent: string;
  totals: PlatformTotals & { cpa: number; roas: number };
  perPlatform: { meta: PlatformTotals; google: PlatformTotals; tiktok: PlatformTotals };
  perCampaign: CampaignRow[];
  /** פילוח המרות מטא לקטגוריות (לידים/שיחות/רכישות) — להצגה נפרדת בדוח */
  conversionCategories: Array<{ label: string; count: number }>;
  /** רכישות מטא בפועל בשבוע (נפרד מלידים) + ערכן */
  metaPurchases: number;
  metaPurchaseValue: number;
}

const emptyTotals = (): PlatformTotals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 });

/** שורת פירוק — קהל (קבוצת מודעות) או מודעה, עם שם ההורה להקשר */
export interface BreakdownRow {
  name: string;
  parentName: string; // שם הקמפיין (לקהל) או קבוצת המודעות (למודעה)
  spend: number;
  conversions: number;
}

export interface WeeklyBreakdowns {
  audiences: BreakdownRow[]; // קבוצות מודעות = קהלים (מטא)
  ads: BreakdownRow[];       // מודעות = קריאייטיבים (מטא)
}

/**
 * פירוק שבועי לפי קהלים (adset) ומודעות (ad) — מטא בלבד.
 * מחזיר את המובילים לפי הוצאה; ריק אם עדיין לא נשאבו נתוני תת-רמות.
 */
export async function getWeeklyBreakdowns(
  clientId: string,
  weekStart: string,
  weekEnd: string,
  topN = 8,
): Promise<WeeklyBreakdowns> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { metaConversionEvent: true },
  });
  const selectedEvent = client?.metaConversionEvent ?? "";
  const date = { gte: weekStart, lte: weekEnd };

  const [adsetRows, adRows, campaignRows] = await Promise.all([
    prisma.metaInsightDaily.findMany({ where: { clientId, level: "adset", date } }),
    prisma.metaInsightDaily.findMany({ where: { clientId, level: "ad", date } }),
    prisma.metaInsightDaily.findMany({
      where: { clientId, level: "campaign", date },
      select: { externalId: true, name: true },
    }),
  ]);

  // מפות שם-הורה: campaign_id→שם קמפיין, adset_id→שם קבוצה
  const campaignNames = new Map(campaignRows.map((r) => [r.externalId, r.name]));
  const adsetNames = new Map(adsetRows.map((r) => [r.externalId, r.name]));

  const groupRows = (rows: typeof adsetRows, parentNames: Map<string, string>): BreakdownRow[] => {
    const groups = new Map<string, typeof adsetRows>();
    for (const r of rows) {
      const arr = groups.get(r.externalId);
      if (arr) arr.push(r);
      else groups.set(r.externalId, [r]);
    }
    const out: BreakdownRow[] = [];
    for (const [, rs] of groups) {
      const spend = rs.reduce((s, i) => s + i.spend, 0);
      if (spend === 0) continue;
      out.push({
        name: rs[0].name || "(ללא שם)",
        parentName: parentNames.get(rs[0].parentId) ?? "",
        spend,
        conversions: countConversions(rs, selectedEvent),
      });
    }
    return out.sort((a, b) => b.spend - a.spend).slice(0, topN);
  };

  return {
    audiences: groupRows(adsetRows, campaignNames),
    ads: groupRows(adRows, adsetNames),
  };
}

/**
 * שולף ומסכם את נתוני הקמפיינים של לקוח לשבוע נתון (YYYY-MM-DD).
 * Meta מסונן ל-level="campaign" (כך הוא נשמר ממילא) — מונע ספירה כפולה,
 * וה-name הוא שם הקמפיין.
 */
export async function getWeeklyClientData(
  clientId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyClientData> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { metaConversionEvent: true, googleConversionAction: true },
  });
  const selectedEvent = client?.metaConversionEvent ?? "";
  const googleSelected = client?.googleConversionAction ?? "";
  const date = { gte: weekStart, lte: weekEnd };

  const [metaRows, gadsRows, ttRows] = await Promise.all([
    prisma.metaInsightDaily.findMany({ where: { clientId, level: "campaign", date } }),
    prisma.googleAdsInsightDaily.findMany({ where: { clientId, date } }),
    prisma.tikTokInsightDaily.findMany({ where: { clientId, date } }),
  ]);

  const perCampaign: CampaignRow[] = [];
  const meta = emptyTotals();
  const google = emptyTotals();
  const tiktok = emptyTotals();

  // --- Meta — קיבוץ לפי שם קמפיין, המרות לפי האירוע הנבחר ---
  const metaGroups = new Map<string, typeof metaRows>();
  for (const r of metaRows) {
    const key = r.name || r.externalId || "(ללא שם)";
    const arr = metaGroups.get(key);
    if (arr) arr.push(r);
    else metaGroups.set(key, [r]);
  }
  let metaPurchases = 0;
  for (const [campaignName, rows] of metaGroups) {
    const spend = rows.reduce((s, i) => s + i.spend, 0);
    const impressions = rows.reduce((s, i) => s + i.impressions, 0);
    const clicks = rows.reduce((s, i) => s + i.clicks, 0);
    const conversions = countConversions(rows, selectedEvent);
    const conversionsValue = rows.reduce((s, i) => s + i.purchaseValue, 0);
    const purchases = rows.reduce((s, i) => s + i.purchases, 0);
    metaPurchases += purchases;
    // מטרת הקמפיין — מהשורה העדכנית ביותר שיש בה objective
    let objective = "";
    for (const r of rows) { try { const o = JSON.parse(r.actionsJson).objective; if (o) { objective = o; break; } } catch { /* skip */ } }
    const resultType = classifyCampaignResult(objective, conversions, purchases);
    perCampaign.push({ platform: "meta", campaignName, spend, impressions, clicks, conversions, conversionsValue, purchases, resultType });
    meta.spend += spend;
    meta.impressions += impressions;
    meta.clicks += clicks;
    meta.conversions += conversions;
    meta.conversionsValue += conversionsValue;
  }

  // --- Google Ads — קיבוץ לפי campaignName ---
  const gadsGroups = new Map<string, typeof gadsRows>();
  for (const r of gadsRows) {
    const key = r.campaignName || r.campaignId || "(ללא שם)";
    const arr = gadsGroups.get(key);
    if (arr) arr.push(r);
    else gadsGroups.set(key, [r]);
  }
  for (const [campaignName, rows] of gadsGroups) {
    const spend = rows.reduce((s, i) => s + i.spend, 0);
    const impressions = rows.reduce((s, i) => s + i.impressions, 0);
    const clicks = rows.reduce((s, i) => s + i.clicks, 0);
    const conversions = countGoogleConversions(rows, googleSelected);
    const conversionsValue = rows.reduce((s, i) => s + i.conversionsValue, 0);
    perCampaign.push({ platform: "google", campaignName, spend, impressions, clicks, conversions, conversionsValue, purchases: 0, resultType: conversions > 0 ? "leads" : "unknown" });
    google.spend += spend;
    google.impressions += impressions;
    google.clicks += clicks;
    google.conversions += conversions;
    google.conversionsValue += conversionsValue;
  }

  // --- TikTok — קיבוץ לפי campaignName ---
  const ttGroups = new Map<string, typeof ttRows>();
  for (const r of ttRows) {
    const key = r.campaignName || r.campaignId || "(ללא שם)";
    const arr = ttGroups.get(key);
    if (arr) arr.push(r);
    else ttGroups.set(key, [r]);
  }
  for (const [campaignName, rows] of ttGroups) {
    const spend = rows.reduce((s, i) => s + i.spend, 0);
    const impressions = rows.reduce((s, i) => s + i.impressions, 0);
    const clicks = rows.reduce((s, i) => s + i.clicks, 0);
    const conversions = rows.reduce((s, i) => s + i.conversions, 0);
    perCampaign.push({ platform: "tiktok", campaignName, spend, impressions, clicks, conversions, conversionsValue: 0, purchases: 0, resultType: conversions > 0 ? "leads" : "unknown" });
    tiktok.spend += spend;
    tiktok.impressions += impressions;
    tiktok.clicks += clicks;
    tiktok.conversions += conversions;
  }

  const totalSpend = meta.spend + google.spend + tiktok.spend;
  const totalConversions = meta.conversions + google.conversions + tiktok.conversions;
  const totalConvValue = meta.conversionsValue + google.conversionsValue + tiktok.conversionsValue;

  perCampaign.sort((a, b) => b.spend - a.spend);

  // פילוח קטגוריות המרה של מטא (לידים/שיחות/רכישות) — להצגה נפרדת בדוח
  const conversionCategories = categorizeSelectedConversions(metaRows, selectedEvent);

  return {
    weekStart,
    weekEnd,
    selectedEvent,
    totals: {
      spend: totalSpend,
      impressions: meta.impressions + google.impressions + tiktok.impressions,
      clicks: meta.clicks + google.clicks + tiktok.clicks,
      conversions: totalConversions,
      conversionsValue: totalConvValue,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
    },
    perPlatform: { meta, google, tiktok },
    perCampaign,
    conversionCategories,
    metaPurchases,
    metaPurchaseValue: meta.conversionsValue,
  };
}
