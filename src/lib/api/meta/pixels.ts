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
}

/**
 * שליפת כל הפיקסלים של חשבון מודעות
 */
export async function fetchPixels(adAccountId: string, accessToken: string): Promise<MetaPixel[]> {
  try {
    return await metaApiGetAll<MetaPixel>(`/${adAccountId}/adspixels`, {
      accessToken,
      params: { fields: "id,name,last_fired_time,is_unified_pixel" },
    });
  } catch (err) {
    console.warn(`[Meta] Failed to fetch pixels for ${adAccountId}:`, err);
    return [];
  }
}

/**
 * שליפת אירועים שהפיקסל קולט
 */
export async function fetchPixelEvents(pixelId: string, accessToken: string): Promise<PixelEventStat[]> {
  try {
    console.log(`[Meta Pixel] Fetching stats for pixel ${pixelId}...`);
    const res = await metaApiGet<{ data: Array<Record<string, unknown>> }>(
      `/${pixelId}/stats`,
      { accessToken, params: { aggregation: "event" } }
    );
    console.log(`[Meta Pixel] Raw response:`, JSON.stringify(res.data?.slice(0, 5)));

    const events: PixelEventStat[] = [];
    if (res.data) {
      for (const item of res.data) {
        // ה-API מחזיר אובייקט שהמפתח הוא שם האירוע
        // יכול להיות { event: "Lead", count: 42 }
        // או { "Lead": { count: 42, ... } }
        // או מבנה אחר — לנסות כמה אפשרויות
        const eventName = (item.event as string)
          ?? (item.value as string)
          ?? Object.keys(item).find((k) => k !== "count" && k !== "timestamp" && typeof item[k] !== "number");

        if (!eventName || eventName === "undefined") continue;

        const count = (item.count as number) ?? 0;
        events.push({ event: eventName, count });
      }
    }

    console.log(`[Meta Pixel] Parsed ${events.length} events:`, events.map((e) => e.event).join(", "));
    return events;
  } catch (err) {
    console.warn(`[Meta] Failed to fetch pixel stats for ${pixelId}:`, err);
    return [];
  }
}

/**
 * שליפת custom conversions של פיקסל ספציפי מחשבון המודעות
 */
export async function fetchPixelCustomConversions(
  adAccountId: string,
  pixelId: string,
  accessToken: string
): Promise<PixelCustomConversion[]> {
  try {
    console.log(`[Meta Pixel] Fetching custom conversions for pixel ${pixelId} in account ${adAccountId}...`);
    const res = await metaApiGetAll<PixelCustomConversion>(`/${adAccountId}/customconversions`, {
      accessToken,
      params: {
        fields: "id,name,custom_event_type",
        filtering: JSON.stringify([{ field: "pixel.id", operator: "EQUAL", value: pixelId }]),
      },
    });
    console.log(`[Meta Pixel] Found ${res.length} custom conversions`);
    return res;
  } catch (err) {
    console.warn(`[Meta] Failed to fetch pixel custom conversions:`, err);
    return [];
  }
}
