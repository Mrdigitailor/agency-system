// בניית DTO אחיד לדשבורד — משמש גם את ה-route הציבורי וגם את ה-preview.
import { prisma } from "@/lib/db/prisma";
import { computeDashboard, type ClientCtx, type DateRange, type WidgetConfig } from "./engine";
import type { Platform, Dimension, DisplayType } from "./metrics";

export interface DashboardDTO {
  client: { name: string; currency: string; clientType: string };
  range: DateRange;
  widgets: Array<{ id: string; title: string; displayType: string; size: string; data: unknown }>;
  generatedAt: string;
}

export interface ResolvedToken {
  client: { id: string; name: string; currency: string; clientType: string; metaConversionEvent: string; googleConversionAction: string };
  reportId: string | null;
}

/** מזהה token ציבורי → דוח + לקוח. קודם ClientReport (חדש), ואז fallback ל-Client (תאימות לאחור). */
export async function resolvePublicToken(token: string): Promise<ResolvedToken | null> {
  const sel = { id: true, name: true, currency: true, clientType: true, metaConversionEvent: true, googleConversionAction: true } as const;

  const report = await prisma.clientReport.findFirst({ where: { publicToken: token, publicEnabled: true }, select: { id: true, clientId: true } });
  if (report) {
    const c = await prisma.client.findFirst({ where: { id: report.clientId, deletedAt: null }, select: sel });
    if (c) return { client: normalizeClient(c), reportId: report.id };
  }
  const legacy = await prisma.client.findFirst({ where: { publicDashboardToken: token, publicDashboardEnabled: true, deletedAt: null }, select: sel });
  if (legacy) return { client: normalizeClient(legacy), reportId: null };
  return null;
}

function normalizeClient(c: { id: string; name: string; currency: string | null; clientType: string | null; metaConversionEvent: string | null; googleConversionAction: string | null }) {
  return {
    id: c.id,
    name: c.name,
    currency: c.currency || "ILS",
    clientType: c.clientType || "לידים",
    metaConversionEvent: c.metaConversionEvent || "",
    googleConversionAction: c.googleConversionAction || "",
  };
}

/** טווח ברירת מחדל — החודש הנוכחי */
export function defaultRange(): DateRange {
  const now = new Date();
  const since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const until = now.toISOString().slice(0, 10);
  return { since, until };
}

const isYmd = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

/** מנרמל ומגביל טווח מקלט משתמש (אף פעם לא זורק) */
export function sanitizeRange(sinceRaw: string | null, untilRaw: string | null): DateRange {
  if (!isYmd(sinceRaw) || !isYmd(untilRaw)) return defaultRange();
  let since = sinceRaw as string;
  let until = untilRaw as string;
  if (since > until) [since, until] = [until, since];
  const days = Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000);
  if (days > 365) since = new Date(new Date(until).getTime() - 365 * 86400000).toISOString().slice(0, 10);
  return { since, until };
}

interface RawWidget {
  id: string; platform: string; metrics: string; dimension: string; displayType: string; size: string; title: string; textBody: string; compare: boolean;
}
function toConfig(w: RawWidget): WidgetConfig {
  let metrics: string[] = [];
  try { const p = JSON.parse(w.metrics || "[]"); if (Array.isArray(p)) metrics = p.filter((x) => typeof x === "string"); } catch {}
  return {
    id: w.id,
    platform: w.platform as Platform,
    metrics,
    dimension: w.dimension as Dimension,
    displayType: w.displayType as DisplayType,
    size: (w.size === "half" || w.size === "third" ? w.size : "full") as "full" | "half" | "third",
    title: w.title,
    textBody: w.textBody ?? "",
    compare: Boolean(w.compare),
  };
}

/**
 * בונה את ה-DTO המלא של הדשבורד ללקוח. allowlist — חושף רק שדות תצוגה.
 */
export async function buildDashboardDTO(
  client: { name: string } & ClientCtx,
  range: DateRange,
  generatedAt: string,
  reportId?: string | null,
): Promise<DashboardDTO> {
  const rawWidgets = await prisma.dashboardWidget.findMany({
    where: { clientId: client.clientId, ...(reportId ? { reportId } : {}) },
    orderBy: { sortOrder: "asc" },
  });
  const configs = rawWidgets.map((w) => toConfig(w as RawWidget));
  const computed = await computeDashboard(configs, client, range);
  const dataById = new Map(computed.map((c) => [c.widgetId, c.data]));

  return {
    client: { name: client.name, currency: client.currency, clientType: client.clientType },
    range,
    widgets: configs.map((w) => ({ id: w.id, title: w.title, displayType: w.displayType, size: w.size, data: dataById.get(w.id) ?? { type: "empty", reason: "אין נתונים" } })),
    generatedAt,
  };
}
