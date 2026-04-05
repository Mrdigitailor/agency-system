// Meta (Facebook) OAuth flow helpers

const META_APP_ID = process.env.META_APP_ID ?? "";
const META_APP_SECRET = process.env.META_APP_SECRET ?? "";
const META_API_VERSION = process.env.META_API_VERSION ?? "v21.0";

export const META_SCOPES = [
  "ads_read",
  "pages_read_engagement",
  "pages_show_list",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
  "read_insights",
].join(",");

export function getRedirectUri(): string {
  return process.env.NODE_ENV === "production"
    ? process.env.META_REDIRECT_URI_PROD ?? ""
    : process.env.META_REDIRECT_URI ?? "http://localhost:3000/api/platforms/meta/callback";
}

/**
 * בניית URL להתחברות של המשתמש ל-Meta
 * ה-state מכיל את ה-clientId כדי לדעת באיזה לקוח מדובר אחרי ה-callback
 */
export function buildAuthUrl(clientId: string, userId: string): string {
  const state = Buffer.from(JSON.stringify({ clientId, userId, ts: Date.now() })).toString("base64url");
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: getRedirectUri(),
    scope: META_SCOPES,
    state,
    response_type: "code",
  });
  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * פיענוח state מה-callback
 */
export function decodeState(state: string): { clientId: string; userId: string; ts: number } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * החלפת code ל-short-lived access token
 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in?: number;
} | null> {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: getRedirectUri(),
    code,
  });

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`,
    { method: "GET" }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[Meta OAuth] exchange code failed:", err);
    return null;
  }

  return res.json();
}

/**
 * המרת short-lived token ל-long-lived (60 ימים)
 */
export async function exchangeForLongLivedToken(shortToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
} | null> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${params.toString()}`,
    { method: "GET" }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[Meta OAuth] long-lived exchange failed:", err);
    return null;
  }

  return res.json();
}

/**
 * מחזיר פרטי המשתמש המחובר
 */
export async function getMeInfo(accessToken: string): Promise<{ id: string; name: string; email?: string } | null> {
  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name,email&access_token=${accessToken}`
  );
  if (!res.ok) return null;
  return res.json();
}
