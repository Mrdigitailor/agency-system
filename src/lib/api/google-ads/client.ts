// Google Ads REST API client (v17)

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v17";
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
