// Meta Graph API client with retry + error handling

const META_API_VERSION = process.env.META_API_VERSION ?? "v21.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}

export interface MetaApiOptions {
  accessToken: string;
  params?: Record<string, string | number | boolean>;
  retries?: number;
  retryDelayMs?: number;
}

/**
 * קריאה ל-Graph API עם retry אוטומטי
 */
export async function metaApiGet<T>(path: string, opts: MetaApiOptions): Promise<T> {
  const retries = opts.retries ?? 3;
  const retryDelay = opts.retryDelayMs ?? 1000;

  const params = new URLSearchParams({ access_token: opts.accessToken });
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      params.append(k, String(v));
    }
  }

  const url = `${BASE_URL}${path}?${params.toString()}`;
  // הדפסת URL בלי access_token (לבטיחות)
  const logUrl = url.replace(/access_token=[^&]+/, "access_token=***");
  console.log(`[MetaAPI] GET ${logUrl.slice(0, 200)}...`);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        return res.json() as Promise<T>;
      }

      const errorBody = (await res.json().catch(() => null)) as MetaApiError | null;
      const errorMsg = errorBody?.error?.message ?? `HTTP ${res.status}`;
      const errorCode = errorBody?.error?.code ?? res.status;

      // 4xx errors (auth, permissions) — אין טעם ב-retry
      if (res.status >= 400 && res.status < 500 && errorCode !== 4 && errorCode !== 17 && errorCode !== 32) {
        throw new Error(`Meta API error: ${errorMsg} (code: ${errorCode})`);
      }

      // Rate limit (code 4, 17, 32) או 5xx — retry
      lastError = new Error(`Meta API error: ${errorMsg} (code: ${errorCode})`);
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`[Meta API] Retry ${attempt + 1}/${retries} after ${delay}ms — ${errorMsg}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries && !(err as Error).message.startsWith("Meta API error:")) {
        await new Promise((r) => setTimeout(r, retryDelay * Math.pow(2, attempt)));
      } else if ((err as Error).message.startsWith("Meta API error:")) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("Meta API: unknown error");
}

/**
 * קריאה pagination-aware — שואבת את כל הדפים
 */
export async function metaApiGetAll<T>(path: string, opts: MetaApiOptions): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = null;

  const firstPage = await metaApiGet<{ data: T[]; paging?: { next?: string } }>(path, opts);
  results.push(...firstPage.data);
  nextUrl = firstPage.paging?.next ?? null;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) break;
    const page = (await res.json()) as { data: T[]; paging?: { next?: string } };
    results.push(...page.data);
    nextUrl = page.paging?.next ?? null;
    // הגבלה כדי לא לתקוע את הסנכרון
    if (results.length > 5000) break;
  }

  return results;
}
