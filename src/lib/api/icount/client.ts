// תקשורת עם iCount (מערכת החשבוניות) — https://api.icount.co.il
// תומך בשתי שיטות אימות:
//   1. ICOUNT_TOKEN — טוקן סטטי (Bearer) מהגדרות ה-API באייקאונט (מומלץ)
//   2. ICOUNT_CID + ICOUNT_USER + ICOUNT_PASS — התחברות שמחזירה sid לכל סשן
// כל הקריאות הן POST JSON ל-/api/v3.php/{module}/{method}

const ICOUNT_BASE = process.env.ICOUNT_API_BASE ?? "https://api.icount.co.il/api/v3.php";

interface IcountResponse {
  status: boolean;
  reason?: string;
  error_description?: string;
  sid?: string;
  [key: string]: unknown;
}

let cachedSid: { sid: string; at: number } | null = null;

/** התחברות עם cid/user/pass — מחזיר sid (נשמר בזיכרון ל-20 דקות) */
async function login(): Promise<string> {
  if (cachedSid && Date.now() - cachedSid.at < 20 * 60 * 1000) return cachedSid.sid;
  const res = await fetch(`${ICOUNT_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cid: process.env.ICOUNT_CID ?? "",
      user: process.env.ICOUNT_USER ?? "",
      pass: process.env.ICOUNT_PASS ?? "",
    }),
  });
  const data = (await res.json()) as IcountResponse;
  if (!data.status || !data.sid) {
    throw new Error(`iCount login failed: ${data.reason ?? data.error_description ?? res.status}`);
  }
  cachedSid = { sid: data.sid, at: Date.now() };
  return data.sid;
}

export function isIcountConfigured(): boolean {
  return Boolean(process.env.ICOUNT_TOKEN || (process.env.ICOUNT_CID && process.env.ICOUNT_USER && process.env.ICOUNT_PASS));
}

/** קריאה גנרית ל-iCount — מצרף token או sid לפי מה שמוגדר */
export async function icountRequest<T = IcountResponse>(
  module: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const token = process.env.ICOUNT_TOKEN;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const body: Record<string, unknown> = { ...params };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    body.sid = await login();
  }

  const res = await fetch(`${ICOUNT_BASE}/${module}/${method}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as IcountResponse | null;
  if (!data) throw new Error(`iCount ${module}/${method}: תשובה לא תקינה (HTTP ${res.status})`);
  if (data.status === false) {
    throw new Error(`iCount ${module}/${method}: ${data.reason ?? data.error_description ?? "שגיאה לא ידועה"}`);
  }
  return data as T;
}
