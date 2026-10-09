// ערכת השכפול: גישה מבוקרת לגוגל אדס עבור הסוכנים שרצים מתיקיית לקוח.
// הסוכן לא מחזיק הרשאות לגוגל. הוא שולח בקשה למערכת, והמערכת מבצעת אותה בשמו עם ההרשאות השמורות אצלה,
// רק בחשבונות של המשפך, ועם מעקות הבטיחות שכאן.
import { prisma } from "@/lib/db/prisma";
import { getValidGoogleToken } from "@/lib/api/google-ads/client";

const API = `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION ?? "v24"}`;
const OWN_ACCOUNT = "3798644658"; // חשבון הסוכנות עצמה (המשפך שלנו)

/** השירותים שמותר לסוכן לשנות. כל השאר נדחה. */
export const MUTATE_SERVICES = [
  "campaignBudgets", "campaigns", "campaignCriteria", "adGroups", "adGroupCriteria", "adGroupAds",
  "assets", "campaignAssets", "adGroupAssets", "customConversionGoals", "conversionGoalCampaignConfigs", "campaignConversionGoals",
] as const;

const digits = (id: string) => id.replace(/\D/g, "");

/** חשבון מותר = החשבון שלנו, או חשבון של לקוח שיש לו פורטל במשפך */
export async function isAllowedAccount(customerId: string): Promise<boolean> {
  const cid = digits(customerId);
  if (cid === OWN_ACCOUNT) return true;
  const portals = await prisma.funnelPortal.findMany({ where: { deletedAt: null, clientId: { not: null } }, select: { clientId: true } });
  const clientIds = portals.map((p) => p.clientId).filter((x): x is string => Boolean(x));
  if (!clientIds.length) return false;
  const assets = await prisma.platformAsset.findMany({
    where: { assetType: "google_ads_account", isSelected: true, connection: { clientId: { in: clientIds }, platform: "google_ads" } },
    select: { externalId: true },
  });
  return assets.some((a) => digits(a.externalId) === cid);
}

// איזה חיבור (ואיזה חשבון ניהול) מצליח לגשת לכל חשבון: נמצא פעם אחת ונשמר בזיכרון
const accessCache = new Map<string, { connId: string; mcc: string }>();

async function headersFor(customerId: string): Promise<Record<string, string>> {
  const cid = digits(customerId);
  const base = (token: string, mcc: string) => {
    const h: Record<string, string> = { Authorization: `Bearer ${token}`, "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "", "Content-Type": "application/json" };
    if (mcc) h["login-customer-id"] = mcc;
    return h;
  };
  const cached = accessCache.get(cid);
  if (cached) {
    const conn = await prisma.platformConnection.findUnique({ where: { id: cached.connId } });
    if (conn) return base(await getValidGoogleToken(conn), cached.mcc);
  }
  const conns = await prisma.platformConnection.findMany({
    where: { platform: "google_ads", isActive: true, refreshToken: { not: "" } }, include: { assets: true }, orderBy: { lastSyncAt: "desc" },
  });
  for (const conn of conns) {
    let token: string;
    try { token = await getValidGoogleToken(conn); } catch { continue; }
    const mccs = new Set<string>([""]);
    for (const a of conn.assets) { try { const m = JSON.parse(a.extraData || "{}").mccId; if (m) mccs.add(digits(String(m))); } catch { /* נכס בלי נתונים */ } }
    for (const mcc of mccs) {
      const res = await fetch(`${API}/customers/${cid}/googleAds:search`, { method: "POST", headers: base(token, mcc), body: JSON.stringify({ query: "SELECT customer.id FROM customer LIMIT 1" }) });
      if (res.ok) { accessCache.set(cid, { connId: conn.id, mcc }); return base(token, mcc); }
    }
  }
  throw new Error("אין חיבור פעיל עם גישה לחשבון הזה. צריך לקשר את החשבון לחשבון הניהול שלנו.");
}

export async function gadsSearch(customerId: string, query: string): Promise<unknown[]> {
  const cid = digits(customerId);
  const headers = await headersFor(cid);
  const rows: unknown[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch(`${API}/customers/${cid}/googleAds:search`, { method: "POST", headers, body: JSON.stringify({ query, pageToken }) });
    const j = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(j?.error ?? j).slice(0, 1500));
    rows.push(...(j.results ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken && rows.length < 2000);
  return rows;
}

type Operation = Record<string, unknown>;

/** מעקות בטיחות: קמפיין נוצר תמיד מושהה, והסוכן לא מדליק ולא מוחק קמפיינים. הדלקה היא החלטה של בעל החשבון. */
function guard(service: string, operations: Operation[]): string | null {
  if (!(MUTATE_SERVICES as readonly string[]).includes(service)) return `השירות ${service} לא פתוח לסוכן`;
  if (service !== "campaigns") return null;
  for (const op of operations) {
    if (op.remove) return "הסוכן לא מוחק קמפיינים";
    const create = op.create as Record<string, unknown> | undefined;
    if (create) create.status = "PAUSED";
    const update = op.update as Record<string, unknown> | undefined;
    if (update?.status === "ENABLED") return "הדלקת קמפיין נעשית רק על ידי בעל החשבון";
  }
  return null;
}

export async function gadsMutate(customerId: string, service: string, operations: Operation[], validateOnly = false): Promise<unknown> {
  const blocked = guard(service, operations);
  if (blocked) throw new Error(blocked);
  const cid = digits(customerId);
  const headers = await headersFor(cid);
  const res = await fetch(`${API}/customers/${cid}/${service}:mutate`, { method: "POST", headers, body: JSON.stringify({ operations, validateOnly }) });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j?.error ?? j).slice(0, 2500));
  if (!validateOnly) console.log(`[Kit] ${service}:mutate on ${cid}: ${operations.length} operation(s)`);
  return j;
}
