// שליפת פוסטים + insights של עמודי פייסבוק

import { metaApiGet, metaApiGetAll } from "./client";

export interface FbPost {
  id: string;
  message?: string;
  permalink_url?: string;
  created_time: string;
  attachments?: {
    data?: Array<{
      media_type?: string;
      url?: string;
      target?: { url?: string };
      media?: { image?: { src?: string } };
    }>;
  };
}

export interface FbPostInsights {
  reach: number;
  impressions: number;
  engagement: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews: number;
}

/**
 * שליפת פוסטים מעמוד (ב-60 ימים אחרונים)
 */
export async function fetchPagePosts(pageId: string, pageAccessToken: string, limit = 50): Promise<FbPost[]> {
  const since = Math.floor((Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000);
  return metaApiGetAll<FbPost>(`/${pageId}/posts`, {
    accessToken: pageAccessToken,
    params: {
      fields: "id,message,permalink_url,created_time,attachments{media_type,url,target,media}",
      since: String(since),
      limit: String(limit),
    },
  });
}

/**
 * שליפת insights של פוסט בודד
 */
export async function fetchPostInsights(postId: string, pageAccessToken: string): Promise<FbPostInsights> {
  const metrics = [
    "post_impressions",
    "post_impressions_unique", // reach
    "post_engaged_users",
    "post_reactions_by_type_total",
    "post_clicks",
    "post_video_views",
  ].join(",");

  try {
    const res = await metaApiGet<{ data: Array<{ name: string; values: Array<{ value: number | Record<string, number> }> }> }>(
      `/${postId}/insights`,
      { accessToken: pageAccessToken, params: { metric: metrics } }
    );

    const getMetric = (name: string): number => {
      const item = res.data.find((d) => d.name === name);
      const val = item?.values[0]?.value;
      if (typeof val === "number") return val;
      if (typeof val === "object" && val) {
        return Object.values(val).reduce<number>((sum, v) => sum + Number(v), 0);
      }
      return 0;
    };

    return {
      reach: getMetric("post_impressions_unique"),
      impressions: getMetric("post_impressions"),
      engagement: getMetric("post_engaged_users"),
      reactions: getMetric("post_reactions_by_type_total"),
      comments: 0, // ישוב מהפוסט עצמו
      shares: 0,
      clicks: getMetric("post_clicks"),
      videoViews: getMetric("post_video_views"),
    };
  } catch (err) {
    console.warn(`[Meta Page] failed to fetch insights for post ${postId}:`, err);
    return { reach: 0, impressions: 0, engagement: 0, reactions: 0, comments: 0, shares: 0, clicks: 0, videoViews: 0 };
  }
}

/**
 * שליפת comments + shares של פוסט (סיכום בלבד)
 */
export async function fetchPostEngagement(postId: string, pageAccessToken: string): Promise<{ comments: number; shares: number }> {
  try {
    const res = await metaApiGet<{
      comments?: { summary?: { total_count: number } };
      shares?: { count: number };
    }>(`/${postId}`, {
      accessToken: pageAccessToken,
      params: { fields: "comments.summary(true).limit(0),shares" },
    });
    return {
      comments: res.comments?.summary?.total_count ?? 0,
      shares: res.shares?.count ?? 0,
    };
  } catch {
    return { comments: 0, shares: 0 };
  }
}

export function extractMediaInfo(post: FbPost): { mediaType: string; mediaUrl: string } {
  const att = post.attachments?.data?.[0];
  if (!att) return { mediaType: "status", mediaUrl: "" };
  const type = att.media_type?.toLowerCase() ?? "";
  const url = att.media?.image?.src ?? att.url ?? "";
  if (type === "video" || type === "video_inline") return { mediaType: "video", mediaUrl: url };
  if (type === "photo" || type === "album") return { mediaType: "photo", mediaUrl: url };
  if (att.target?.url) return { mediaType: "link", mediaUrl: url };
  return { mediaType: "status", mediaUrl: url };
}
