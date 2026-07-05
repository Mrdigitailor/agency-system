// סורק קודי מעקב באתר הלקוח — בדיקה דטרמיניסטית של ה-HTML (בלי AI).
// מגבלה מובנית: פיקסלים שמוזרקים דרך GTM לא נראים ב-HTML הגולמי,
// לכן כשיש GTM אבל אין פיקסל ישיר — התוצאה היא "לוודא" ולא "חסר".

export interface SiteScanResult {
  ok: boolean;
  url: string;
  hasMetaPixel: boolean;
  hasGA4: boolean;
  hasGTM: boolean;
  hasTikTokPixel: boolean;
  error?: string;
}

const SCAN_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function scanWebsite(rawUrl: string): Promise<SiteScanResult> {
  const url = normalizeUrl(rawUrl);
  const empty: SiteScanResult = { ok: false, url, hasMetaPixel: false, hasGA4: false, hasGTM: false, hasTikTokPixel: false };
  if (!url) return { ...empty, error: "לא הוגדרה כתובת אתר" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return { ...empty, error: `האתר החזיר שגיאה (${res.status})` };

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);

    return {
      ok: true,
      url,
      hasMetaPixel: /connect\.facebook\.net\/[^"']*fbevents\.js/i.test(html) || /\bfbq\s*\(/.test(html),
      hasGA4: /googletagmanager\.com\/gtag\/js\?id=G-/i.test(html) || /gtag\s*\(\s*['"]config['"]\s*,\s*['"]G-/i.test(html),
      hasGTM: /googletagmanager\.com\/gtm\.js/i.test(html) || /['"]GTM-[A-Z0-9]{4,}/i.test(html),
      hasTikTokPixel: /analytics\.tiktok\.com/i.test(html) || /\bttq\.load\s*\(/.test(html),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ...empty, error: aborted ? "האתר לא הגיב תוך 10 שניות" : "לא ניתן לגשת לאתר" };
  } finally {
    clearTimeout(timer);
  }
}
