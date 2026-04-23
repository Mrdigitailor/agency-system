// TikTok Business API client

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
const APP_ID = process.env.TIKTOK_APP_ID ?? "";
const APP_SECRET = process.env.TIKTOK_APP_SECRET ?? "";

export { APP_ID, APP_SECRET };

interface TikTokResponse<T> {
  code: number;
  message: string;
  data: T;
}

async function tiktokGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${TIKTOK_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  console.log(`[TikTok] GET ${path}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  // TikTok requires Access-Token header in addition to query param
  const headers: Record<string, string> = {};
  if (params.access_token) headers["Access-Token"] = params.access_token;

  const res = await fetch(url.toString(), { headers, signal: controller.signal });
  clearTimeout(timer);

  if (!res.ok) throw new Error(`TikTok API error: HTTP ${res.status}`);
  const json = await res.json() as TikTokResponse<T>;
  if (json.code !== 0) throw new Error(`TikTok API error: ${json.message} (code: ${json.code})`);
  return json.data;
}

async function tiktokPost<T>(path: string, body: Record<string, unknown>, accessToken?: string): Promise<T> {
  console.log(`[TikTok] POST ${path}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Access-Token"] = accessToken;

  const fullUrl = `${TIKTOK_API}${path}`;
  console.log(`[TikTok] POST ${fullUrl} | Access-Token: ${accessToken ? "yes" : "no"}`);

  const res = await fetch(fullUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
    redirect: "manual", // prevent redirect from downgrading POST to GET
  });
  clearTimeout(timer);

  // Handle redirect manually — re-POST to new location
  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    const location = res.headers.get("location");
    if (location) {
      console.log(`[TikTok] Redirect ${res.status} → ${location}`);
      const res2 = await fetch(location, { method: "POST", headers, body: JSON.stringify(body) });
      if (!res2.ok) {
        const err = await res2.text().catch(() => "");
        throw new Error(`TikTok API error: HTTP ${res2.status} (after redirect) ${err.slice(0, 200)}`);
      }
      const json2 = await res2.json() as TikTokResponse<T>;
      if (json2.code !== 0) throw new Error(`TikTok API error: ${json2.message} (code: ${json2.code})`);
      return json2.data;
    }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[TikTok] POST failed: HTTP ${res.status} ${errBody.slice(0, 200)}`);
    throw new Error(`TikTok API error: HTTP ${res.status}`);
  }
  const json = await res.json() as TikTokResponse<T>;
  if (json.code !== 0) throw new Error(`TikTok API error: ${json.message} (code: ${json.code})`);
  return json.data;
}

/**
 * Exchange auth_code for access token
 */
export async function exchangeToken(authCode: string): Promise<{
  access_token: string;
  advertiser_ids: string[];
}> {
  return tiktokPost("/oauth2/access_token/", {
    app_id: APP_ID,
    secret: APP_SECRET,
    auth_code: authCode,
  });
}

/**
 * List advertiser accounts accessible to the token
 */
export async function listAdvertisers(accessToken: string): Promise<Array<{
  advertiser_id: string;
  advertiser_name: string;
}>> {
  const data = await tiktokGet<{ list: Array<{ advertiser_id: string; advertiser_name: string }> }>(
    "/oauth2/advertiser/get/",
    { app_id: APP_ID, secret: APP_SECRET, access_token: accessToken }
  );
  return data.list ?? [];
}

/**
 * Fetch campaign report data
 */
export async function fetchCampaignReport(
  advertiserId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<Array<Record<string, unknown>>> {
  const data = await tiktokPost<{ list: Array<{ dimensions: Record<string, string>; metrics: Record<string, unknown> }> }>(
    "/report/integrated/get/",
    {
      advertiser_id: advertiserId,
      report_type: "BASIC",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: [
        "spend", "impressions", "clicks", "ctr", "cpc", "cpm",
        "reach", "frequency", "conversion", "cost_per_conversion",
        "conversion_rate", "video_play_actions", "video_watched_2s",
        "video_watched_6s", "likes", "comments", "shares", "follows",
        "profile_visits",
      ],
      data_level: "AUCTION_CAMPAIGN",
      start_date: startDate,
      end_date: endDate,
      page_size: 1000,
    },
    accessToken,
  );

  return (data.list ?? []).map((row) => ({
    ...row.dimensions,
    ...row.metrics,
  }));
}

/**
 * Fetch campaign list (names, status, objective)
 */
export async function fetchCampaigns(
  advertiserId: string,
  accessToken: string,
): Promise<Array<{ campaign_id: string; campaign_name: string; objective_type: string; status: string }>> {
  const data = await tiktokPost<{ list: Array<{ campaign_id: string; campaign_name: string; objective_type: string; operation_status: string }> }>(
    "/campaign/get/",
    {
      advertiser_id: advertiserId,
      fields: ["campaign_id", "campaign_name", "objective_type", "operation_status"],
    },
    accessToken,
  );
  return (data.list ?? []).map((c) => ({
    campaign_id: String(c.campaign_id),
    campaign_name: c.campaign_name,
    objective_type: c.objective_type,
    status: c.operation_status,
  }));
}
