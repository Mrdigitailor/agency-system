// שליפת הודעות ותגובות מ-Facebook ו-Instagram

import { metaApiGet, metaApiGetAll } from "./client";

// ==================== Facebook Messages ====================

export interface FbConversation {
  id: string;
  updated_time: string;
  message_count: number;
  participants?: { data: Array<{ name: string; id: string }> };
  messages?: { data: Array<FbMessage> };
}

export interface FbMessage {
  id: string;
  message: string;
  from: { name: string; id: string };
  created_time: string;
}

export async function fetchPageConversations(pageId: string, pageAccessToken: string, limit = 20): Promise<FbConversation[]> {
  try {
    return await metaApiGetAll<FbConversation>(`/${pageId}/conversations`, {
      accessToken: pageAccessToken,
      params: {
        fields: "participants,updated_time,message_count,messages{message,from,created_time}",
        limit: String(limit),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("(#200)") || msg.includes("OAuthException") || msg.includes("pages_messaging")) {
      throw new Error("PERMISSION_MISSING:pages_messaging");
    }
    throw err;
  }
}

// ==================== Facebook Comments ====================

export interface FbComment {
  id: string;
  message: string;
  from?: { name: string; id: string };
  created_time: string;
  like_count: number;
  post_id?: string;
  post_message?: string;
}

export async function fetchPageComments(pageId: string, pageAccessToken: string, limit = 50): Promise<FbComment[]> {
  // שלוף פוסטים אחרונים עם תגובות
  const posts = await metaApiGetAll<{
    id: string;
    message?: string;
    comments?: { data: Array<{ id: string; message: string; from?: { name: string; id: string }; created_time: string; like_count?: number }> };
  }>(`/${pageId}/feed`, {
    accessToken: pageAccessToken,
    params: {
      fields: "id,message,comments{message,from,created_time,like_count}",
      limit: String(Math.min(limit, 25)),
    },
  });

  const comments: FbComment[] = [];
  for (const post of posts) {
    if (!post.comments?.data) continue;
    for (const c of post.comments.data) {
      comments.push({
        ...c,
        like_count: c.like_count ?? 0,
        post_id: post.id,
        post_message: post.message?.slice(0, 80),
      });
    }
  }
  return comments.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());
}

// ==================== Instagram Comments ====================

export interface IgComment {
  id: string;
  text: string;
  from?: { username: string; id: string };
  timestamp: string;
  like_count: number;
  media_id?: string;
  media_caption?: string;
}

export async function fetchIgComments(igAccountId: string, accessToken: string, limit = 50): Promise<IgComment[]> {
  // שלוף media אחרונים עם תגובות
  const media = await metaApiGetAll<{
    id: string;
    caption?: string;
    comments?: { data: Array<{ id: string; text: string; from?: { username: string; id: string }; timestamp: string; like_count?: number }> };
  }>(`/${igAccountId}/media`, {
    accessToken,
    params: {
      fields: "id,caption,comments{text,from,timestamp,like_count}",
      limit: String(Math.min(limit, 25)),
    },
  });

  const comments: IgComment[] = [];
  for (const m of media) {
    if (!m.comments?.data) continue;
    for (const c of m.comments.data) {
      comments.push({
        ...c,
        like_count: c.like_count ?? 0,
        media_id: m.id,
        media_caption: m.caption?.slice(0, 80),
      });
    }
  }
  return comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
