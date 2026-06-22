// Google Ads REST API client

import { prisma } from "@/lib/db/prisma";

// גרסת ה-API ניתנת להגדרה דרך משתנה סביבה (GOOGLE_ADS_API_VERSION).
// גוגל עברה לשחרורים חודשיים ב-2026 וכל גרסה נחסמת ~שנה אחרי שחרורה,
// אז כשמגיעה התראת deprecation מספיק לעדכן את המשתנה — בלי שינוי קוד.
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION ?? "v24";
const GOOGLE_ADS_API = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";

interface GoogleAdsApiOptions {
  accessToken: string;
  loginCustomerId?: string; // MCC manager account ID (if applicable)
}

/**
 * רענון access token עם refresh token
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
} | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[GoogleAds] Token refresh failed:", err);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error("[GoogleAds] Token refresh error:", err);
    return null;
  }
}

/**
 * מחזיר access token תקף ל-Google Ads — מרענן אוטומטית אם פג או עומד לפוג (חלון 5 דק׳).
 * הטוקן החדש נשמר ל-DB.
 *
 * Throws אם אין refreshToken או שהרענון נכשל — המשמעות: הלקוח צריך להתחבר מחדש.
 */
export async function getValidGoogleToken(conn: {
  id: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date | null;
}): Promise<string> {
  const FIVE_MIN_MS = 5 * 60 * 1000;
  const expiresAt = conn.tokenExpiry ? new Date(conn.tokenExpiry).getTime() : 0;
  const isExpired = !expiresAt || expiresAt < Date.now() + FIVE_MIN_MS;

  if (!isExpired) {
    return conn.accessToken;
  }

  if (!conn.refreshToken) {
    throw new Error("No refresh token — need to reconnect");
  }

  console.log(`[GoogleAds] Token expired/expiring (expiresAt=${conn.tokenExpiry?.toISOString() ?? "null"}), refreshing…`);

  const refreshed = await refreshGoogleToken(conn.refreshToken);
  if (!refreshed) {
    throw new Error("Token refresh failed — need to reconnect");
  }

  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
  await prisma.platformConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: refreshed.access_token,
      tokenExpiry: newExpiry,
    },
  });

  console.log(`[GoogleAds] Token refreshed, new expiry ${newExpiry.toISOString()}`);
  return refreshed.access_token;
}

function buildHeaders(opts: GoogleAdsApiOptions): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    "developer-token": DEV_TOKEN,
    "Content-Type": "application/json",
  };
  if (opts.loginCustomerId) {
    h["login-customer-id"] = opts.loginCustomerId.replace(/-/g, "");
  }
  return h;
}

/**
 * שליפת רשימת חשבונות נגישים למשתמש
 */
export async function listAccessibleCustomers(opts: GoogleAdsApiOptions): Promise<string[]> {
  const url = `${GOOGLE_ADS_API}/customers:listAccessibleCustomers`;
  console.log("[GoogleAds] GET listAccessibleCustomers");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(url, {
    headers: buildHeaders(opts),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const err = await res.text();
    console.error("[GoogleAds] listAccessibleCustomers failed:", err);
    throw new Error(`Google Ads API error: ${err}`);
  }

  const data = await res.json();
  // resourceNames: ["customers/1234567890", ...]
  return (data.resourceNames ?? []).map((r: string) => r.replace("customers/", ""));
}

/**
 * שליפת חשבונות לקוח תחת MCC (manager account)
 * מחזיר רק חשבונות רגילים (manager=false, status=ENABLED)
 */
export async function listMccChildAccounts(
  mccId: string,
  opts: GoogleAdsApiOptions
): Promise<Array<{ id: string; name: string; currencyCode: string; isManager: boolean }>> {
  const cleanMcc = mccId.replace(/-/g, "");
  console.log(`[GoogleAds] Listing child accounts under MCC ${cleanMcc}`);

  const query = `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.manager,
      customer_client.status,
      customer_client.currency_code
    FROM customer_client
    WHERE customer_client.status = 'ENABLED'
  `;

  const results = await searchStream(cleanMcc, query, {
    ...opts,
    loginCustomerId: cleanMcc,
  });

  const accounts = results.map((r: any) => {
    const cc = r.customerClient ?? {};
    return {
      id: String(cc.id ?? ""),
      name: cc.descriptiveName ?? String(cc.id ?? ""),
      currencyCode: cc.currencyCode ?? "ILS",
      isManager: cc.manager === true,
    };
  });

  console.log(`[GoogleAds] MCC ${cleanMcc}: found ${accounts.length} child accounts (${accounts.filter(a => !a.isManager).length} non-manager)`);
  return accounts;
}

/**
 * שליפת פרטי חשבון
 */
export async function getCustomerInfo(
  customerId: string,
  opts: GoogleAdsApiOptions
): Promise<{ id: string; name: string; currencyCode: string; timeZone: string }> {
  const cleanId = customerId.replace(/-/g, "");
  const url = `${GOOGLE_ADS_API}/customers/${cleanId}`;
  console.log(`[GoogleAds] GET customer ${cleanId}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(url, {
    headers: buildHeaders(opts),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const err = await res.text();
    console.error(`[GoogleAds] getCustomerInfo(${cleanId}) failed:`, err);
    throw new Error(`Google Ads API error: ${err}`);
  }

  const data = await res.json();
  return {
    id: cleanId,
    name: data.descriptiveName ?? cleanId,
    currencyCode: data.currencyCode ?? "ILS",
    timeZone: data.timeZone ?? "Asia/Jerusalem",
  };
}

/**
 * הרצת GAQL query עם searchStream
 */
export async function searchStream(
  customerId: string,
  query: string,
  opts: GoogleAdsApiOptions
): Promise<any[]> {
  const cleanId = customerId.replace(/-/g, "");
  const url = `${GOOGLE_ADS_API}/customers/${cleanId}/googleAds:searchStream`;
  const logQuery = query.replace(/\s+/g, " ").slice(0, 200);
  console.log(`[GoogleAds] searchStream(${cleanId}): ${logQuery}...`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(opts),
    body: JSON.stringify({ query }),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const err = await res.text();
    console.error(`[GoogleAds] searchStream(${cleanId}) failed:`, err);
    throw new Error(`Google Ads API error: ${err}`);
  }

  const data = await res.json();
  // Response: array of batches, each with results[]
  const results: any[] = [];
  if (Array.isArray(data)) {
    for (const batch of data) {
      if (batch.results) results.push(...batch.results);
    }
  } else if (data.results) {
    results.push(...data.results);
  }

  console.log(`[GoogleAds] searchStream(${cleanId}): ${results.length} rows`);
  return results;
}
