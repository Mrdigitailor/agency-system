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

/**
 * GET request to TikTok API with Access-Token header
 */
async function tiktokGet<T>(path: string, params: Record<string, string>, accessToken?: string): Promise<T> {
  const url = new URL(`${TIKTOK_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const fullUrl = url.toString();
  console.log(`[TikTok] GET ${path} (${Object.keys(params).length} params)`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const headers: Record<string, string> = {};
  if (accessToken) headers["Access-Token"] = accessToken;
  // Also check params for backward compat
  if (!accessToken && params.access_token) headers["Access-Token"] = params.access_token;

  const res = await fetch(fullUrl, { headers, signal: controller.signal });
  clearTimeout(timer);

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[TikTok] GET ${path} failed: HTTP ${res.status} ${errBody.slice(0, 200)}`);
    throw new Error(`TikTok API error: HTTP ${res.status}`);
  }

  const json = await res.json() as TikTokResponse<T>;
  if (json.code !== 0) throw new Error(`TikTok API error: ${json.message} (code: ${json.code})`);
  return json.data;
}

/**
 * POST request to TikTok API (only for oauth2/access_token)
 */
async function tiktokPost<T>(path: string, body: Record<string, unknown>, accessToken?: string): Promise<T> {
  const fullUrl = `${TIKTOK_API}${path}`;
  console.log(`[TikTok] POST ${fullUrl}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Access-Token"] = accessToken;

  const res = await fetch(fullUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error(`[TikTok] POST ${path} failed: HTTP ${res.status} ${errBody.slice(0, 200)}`);
    throw new Error(`TikTok API error: HTTP ${res.status}`);
  }

  const json = await res.json() as TikTokResponse<T>;
  if (json.code !== 0) throw new Error(`TikTok API error: ${json.message} (code: ${json.code})`);
  return json.data;
}

/**
 * Exchange auth_code for access token (POST)
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
 * List advertiser accounts (GET)
 */
export async function listAdvertisers(accessToken: string): Promise<Array<{
  advertiser_id: string;
  advertiser_name: string;
}>> {
  const data = await tiktokGet<{ list: Array<{ advertiser_id: string; advertiser_name: string }> }>(
    "/oauth2/advertiser/get/",
    { app_id: APP_ID, secret: APP_SECRET, access_token: accessToken },
    accessToken,
  );
  return data.list ?? [];
}

/**
 * Fetch campaign report data (GET — params as query string with JSON arrays)
 */
export async function fetchCampaignReport(
  advertiserId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<Array<Record<string, unknown>>> {
  const allRows: Array<Record<string, unknown>> = [];
  let page = 1;
  const pageSize = 1000;

  while (true) {
    const data = await tiktokGet<{
      list: Array<{ dimensions: Record<string, string>; metrics: Record<string, unknown> }>;
      page_info?: { total_number?: number; total_page?: number; page?: number };
    }>(
      "/report/integrated/get/",
      {
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_CAMPAIGN",
        dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
        metrics: JSON.stringify([
          "spend", "impressions", "clicks", "ctr", "cpc", "cpm",
          "reach", "frequency", "conversion", "cost_per_conversion",
          "conversion_rate", "video_play_actions", "video_watched_2s",
          "video_watched_6s", "likes", "comments", "shares", "follows",
          "profile_visits",
        ]),
        start_date: startDate,
        end_date: endDate,
        page_size: String(pageSize),
        page: String(page),
      },
      accessToken,
    );

    const rows = (data.list ?? []).map((row) => ({ ...row.dimensions, ...row.metrics }));
    allRows.push(...rows);
    console.log(`[TikTok] Report page ${page}: ${rows.length} rows (total so far: ${allRows.length})`);

    const totalPages = data.page_info?.total_page ?? 1;
    if (page >= totalPages || rows.length < pageSize) break;
    page++;
    if (page > 20) break; // safety limit
  }

  return allRows;
}

/**
 * Fetch campaign list (GET)
 */
export async function fetchCampaigns(
  advertiserId: string,
  accessToken: string,
): Promise<Array<{ campaign_id: string; campaign_name: string; objective_type: string; status: string }>> {
  const data = await tiktokGet<{ list: Array<{ campaign_id: string; campaign_name: string; objective_type: string; operation_status: string }> }>(
    "/campaign/get/",
    {
      advertiser_id: advertiserId,
      page_size: "1000",
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
