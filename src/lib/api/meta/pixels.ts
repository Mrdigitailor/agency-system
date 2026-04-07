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
 * שליפת אירועים שהפיקסל קולט (aggregation=event)
 */
export async function fetchPixelEvents(pixelId: string, accessToken: string): Promise<PixelEventStat[]> {
  try {
    const res = await metaApiGet<{ data: Array<{ event: string; count: number }> }>(
      `/${pixelId}/stats`,
      { accessToken, params: { aggregation: "event" } }
    );
    return res.data ?? [];
  } catch (err) {
    console.warn(`[Meta] Failed to fetch pixel stats for ${pixelId}:`, err);
    return [];
  }
}
