// שליפת Pixels מ-Meta

import { metaApiGetAll, metaApiGet } from "./client";

export interface MetaPixel {
  id: string;
  name: string;
  last_fired_time?: string;
  is_unified_pixel?: boolean;
}

export interface PixelEventStat {
  event: string;
  count: number;
}

export interface PixelCustomConversion {
  id: string;
  name: string;
  custom_event_type?: string;
  pixel?: { id: string };
}

export async function fetchPixels(adAccountId: string, accessToken: string): Promise<MetaPixel[]> {
  try {
    console.log(`[Pixels] Fetching pixels for ad account ${adAccountId}...`);
    const pixels = await metaApiGetAll<MetaPixel>(`/${adAccountId}/adspixels`, {
      accessToken,
      params: { fields: "id,name,last_fired_time" },
    });
    console.log(`[Pixels] Found ${pixels.length} pixels for ${adAccountId}:`, pixels.map(p => `${p.name} (${p.id})`).join(', '));
    return pixels;
  } catch (err) {
    console.error(`[Pixels] FAILED for ${adAccountId}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * שליפת אירועים שהפיקסל קולט
 * ה-response: [{ start_time, aggregation, data: [{ value: "Lead", count: 5 }] }, ...]
 * צריך לפלטר את data מכל שורה ולאחד
 */
export async function fetchPixelEvents(pixelId: string, accessToken: string): Promise<PixelEventStat[]> {
  try {
    console.log(`[Meta Pixel] Fetching stats for pixel ${pixelId}...`);
    // שאיבה ב-30 ימים אחרונים כדי לתפוס את כל האירועים (לא רק שעות אחרונות)
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    const res = await metaApiGet<{ data: Array<{ start_time?: string; aggregation?: string; data?: Array<{ value: string; count: number }> }> }>(
      `/${pixelId}/stats`,
      { accessToken, params: { aggregation: "event", start_time: String(since), end_time: String(until) } }
    );

    // איחוד — כל time slot מכיל data[] עם events
    const eventMap = new Map<string, number>();
    if (res.data) {
      for (const timeSlot of res.data) {
        if (!timeSlot.data) continue;
        for (const item of timeSlot.data) {
          if (!item.value) continue;
          eventMap.set(item.value, (eventMap.get(item.value) ?? 0) + (item.count ?? 0));
        }
      }
    }

    const events = Array.from(eventMap.entries()).map(([event, count]) => ({ event, count }));
    console.log(`[Meta Pixel] Found ${events.length} unique events:`, events.map((e) => `${e.event}(${e.count})`).join(", "));
    return events;
  } catch (err) {
    console.warn(`[Meta] Failed to fetch pixel stats for ${pixelId}:`, err);
    return [];
  }
}

/**
 * שליפת custom conversions — שואב הכל ומסנן לפי pixelId client-side
 */
export async function fetchPixelCustomConversions(
  adAccountId: string,
  pixelId: string,
  accessToken: string
): Promise<PixelCustomConversion[]> {
  try {
    console.log(`[Meta Pixel] Fetching all custom conversions for account ${adAccountId}...`);
    const all = await metaApiGetAll<PixelCustomConversion>(`/${adAccountId}/customconversions`, {
      accessToken,
      params: { fields: "id,name,custom_event_type,pixel{id}" },
    });
    // סינון — רק custom conversions שמשויכות לפיקסל שלנו
    const filtered = all.filter((cc) => cc.pixel?.id === pixelId);
    console.log(`[Meta Pixel] ${all.length} total custom conversions, ${filtered.length} for pixel ${pixelId}`);
    return filtered;
  } catch (err) {
    console.warn(`[Meta] Failed to fetch custom conversions:`, err);
    return [];
  }
}
