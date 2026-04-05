// שליפת media + insights של חשבון Instagram Business

import { metaApiGet, metaApiGetAll } from "./client";

export interface IgMedia {
  id: string;
  caption?: string;
  permalink?: string;
  media_type?: string; // IMAGE | VIDEO | CAROUSEL_ALBUM | REELS
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
}

export interface IgMediaInsights {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  videoViews: number;
  profileVisits: number;
}

/**
 * שליפת media מחשבון IG (ב-60 ימים אחרונים)
 */
export async function fetchIgMedia(igAccountId: string, accessToken: string, limit = 50): Promise<IgMedia[]> {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const all = await metaApiGetAll<IgMedia>(`/${igAccountId}/media`, {
    accessToken,
    params: {
      fields: "id,caption,permalink,media_type,media_url,thumbnail_url,timestamp",
      limit: String(limit),
    },
  });
  return all.filter((m) => m.timestamp >= since);
}

/**
 * שליפת insights של media
 * מטריקות שונות לפי סוג media (IMAGE vs VIDEO/REELS)
 */
export async function fetchIgMediaInsights(media: IgMedia, accessToken: string): Promise<IgMediaInsights> {
  const isVideo = media.media_type === "VIDEO" || media.media_type === "REELS";

  // מטריקות שונות לפי סוג
  const metrics = isVideo
    ? "reach,impressions,likes,comments,saved,shares,video_views"
    : "reach,impressions,likes,comments,saved,shares";

  try {
    const res = await metaApiGet<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
      `/${media.id}/insights`,
      { accessToken, params: { metric: metrics } }
    );

    const getMetric = (name: string): number => {
      const item = res.data.find((d) => d.name === name);
      return item?.values[0]?.value ?? 0;
    };

    return {
      reach: getMetric("reach"),
      impressions: getMetric("impressions"),
      likes: getMetric("likes"),
      comments: getMetric("comments"),
      saves: getMetric("saved"),
      shares: getMetric("shares"),
      videoViews: isVideo ? getMetric("video_views") : 0,
      profileVisits: 0, // זמין רק ב-account insights
    };
  } catch (err) {
    console.warn(`[Meta IG] failed insights for media ${media.id}:`, err);
    return { reach: 0, impressions: 0, likes: 0, comments: 0, saves: 0, shares: 0, videoViews: 0, profileVisits: 0 };
  }
}
