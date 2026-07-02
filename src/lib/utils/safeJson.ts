// פענוח JSON חסין — שורה פגומה אחת ב-DB לא תפיל route שלם.
export function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/** מערך מחרוזות מ-JSON, עם fallback ל-[] */
export function safeParseArray(raw: string | null | undefined): unknown[] {
  const v = safeParse<unknown>(raw, []);
  return Array.isArray(v) ? v : [];
}
