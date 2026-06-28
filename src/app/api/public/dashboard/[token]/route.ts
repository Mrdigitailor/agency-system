import { NextResponse } from "next/server";
import { buildDashboardDTO, sanitizeRange, resolvePublicToken, type DashboardDTO } from "@/lib/dashboard/dto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// cache קצר במ-memory למניעת spam (GA4 חי). מפתח: token|since|until
const CACHE = new Map<string, { at: number; dto: DashboardDTO }>();
const TTL = 60_000;

function notFound() {
  // 404 אחיד — לא חושף אם token קיים/מבוטל
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

/**
 * GET /api/public/dashboard/[token]?since=&until=
 * ציבורי (ללא auth). מאומת ע"י token בלבד. fail-closed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return notFound();

  const resolved = await resolvePublicToken(token);
  if (!resolved) return notFound();
  const { client, reportId } = resolved;

  const url = new URL(req.url);
  const range = sanitizeRange(url.searchParams.get("since"), url.searchParams.get("until"));

  const cacheKey = `${token}|${range.since}|${range.until}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json(cached.dto);
  }

  const dto = await buildDashboardDTO(
    { name: client.name, clientId: client.id, currency: client.currency, clientType: client.clientType, metaConversionEvent: client.metaConversionEvent, googleConversionAction: client.googleConversionAction },
    range,
    new Date().toISOString(),
    reportId,
  );

  CACHE.set(cacheKey, { at: Date.now(), dto });
  return NextResponse.json(dto);
}
