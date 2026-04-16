// Meta Graph API client with retry + error handling + proper timeouts

const META_API_VERSION = process.env.META_API_VERSION ?? "v21.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const DEFAULT_TIMEOUT_MS = 60000; // 60 שניות
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;

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
  timeoutMs?: number;
}

function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("socket hang up") ||
    msg.includes("network")
  );
}

function isRetryableStatusCode(code: number): boolean {
  // Rate limit codes: 4, 17, 32; server errors: 500+
  return code === 4 || code === 17 || code === 32 || code >= 500;
}

/**
 * קריאה ל-Graph API עם retry אוטומטי + timeout מוגדר
 */
export async function metaApiGet<T>(path: string, opts: MetaApiOptions): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const retryDelay = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const params = new URLSearchParams({ access_token: opts.accessToken });
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      params.append(k, String(v));
    }
  }

  const url = `${BASE_URL}${path}?${params.toString()}`;
  const logUrl = url.replace(/access_token=[^&]+/, "access_token=***");
  console.log(`[MetaAPI] GET ${logUrl.slice(0, 250)}...`);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        return res.json() as Promise<T>;
      }

      const errorBody = (await res.json().catch(() => null)) as MetaApiError | null;
      const errorMsg = errorBody?.error?.message ?? `HTTP ${res.status}`;
      const errorCode = errorBody?.error?.code ?? res.status;

      // Token expired (code 190) — special error for UI handling
      if (errorCode === 190) {
        throw new Error(`META_TOKEN_EXPIRED: ${errorMsg}`);
      }

      // Non-retryable 4xx (auth, permissions etc)
      if (res.status >= 400 && res.status < 500 && !isRetryableStatusCode(errorCode)) {
        throw new Error(`Meta API error: ${errorMsg} (code: ${errorCode})`);
      }

      // Retryable — rate limit or server error
      lastError = new Error(`Meta API error: ${errorMsg} (code: ${errorCode})`);
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`[MetaAPI] Retry ${attempt + 1}/${retries} after ${delay}ms — ${errorMsg}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      lastError = err as Error;
      // If it's a hard Meta API error (permission etc) — don't retry
      if ((err as Error).message.startsWith("Meta API error:") && !isRetryableError(err as Error)) {
        throw err;
      }
      // Network / timeout / abort — retry
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(`[MetaAPI] Retry ${attempt + 1}/${retries} after ${delay}ms — ${(err as Error).message?.slice(0, 100)}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error("Meta API: unknown error");
}

/**
 * POST ל-Graph API — לפעולות כתיבה (תגובות, הודעות, פוסטים)
 */
export async function metaApiPost<T>(
  path: string,
  body: Record<string, string>,
  opts: { accessToken: string; timeoutMs?: number }
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const formData = new URLSearchParams({ ...body, access_token: opts.accessToken });

  console.log(`[MetaAPI] POST ${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errorBody = (await res.json().catch(() => null)) as MetaApiError | null;
      const errorMsg = errorBody?.error?.message ?? `HTTP ${res.status}`;
      const errorCode = errorBody?.error?.code ?? res.status;
      console.error(`[MetaAPI] POST failed: ${errorMsg} (code: ${errorCode})`);
      throw new Error(`Meta API error: ${errorMsg} (code: ${errorCode})`);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * קריאה pagination-aware — שואבת את כל הדפים עם timeout
 */
export async function metaApiGetAll<T>(path: string, opts: MetaApiOptions): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = null;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const firstPage = await metaApiGet<{ data: T[]; paging?: { next?: string } }>(path, opts);
  results.push(...(firstPage.data ?? []));
  nextUrl = firstPage.paging?.next ?? null;

  while (nextUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(nextUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) break;
      const page = (await res.json()) as { data: T[]; paging?: { next?: string } };
      results.push(...(page.data ?? []));
      nextUrl = page.paging?.next ?? null;
    } catch (err) {
      console.warn(`[MetaAPI] Pagination fetch failed: ${(err as Error).message?.slice(0, 100)}`);
      break; // עדיף להחזיר מה שיש מאשר להיכשל
    }
    if (results.length > 5000) break;
  }

  return results;
}
