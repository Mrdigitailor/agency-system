// שליפת הודעות ותגובות מ-Facebook ו-Instagram

import { metaApiGet, metaApiGetAll, metaApiPost } from "./client";

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

export interface FbCommentReply {
  id: string;
  message: string;
  from?: { name: string; id: string };
  created_time: string;
  like_count?: number;
}

export interface FbComment {
  id: string;
  message: string;
  from?: { name: string; id: string };
  created_time: string;
  like_count: number;
  comment_count?: number;
  permalink_url?: string;
  post_id?: string;
  post_message?: string;
  post_permalink?: string;
  replies?: FbCommentReply[];
}

export async function fetchPageComments(pageId: string, pageAccessToken: string, limit = 50): Promise<FbComment[]> {
  console.log(`[FB Comments] Fetching for page ${pageId} with token ${pageAccessToken.slice(0, 8)}...`);

  const posts = await metaApiGetAll<{
    id: string;
    message?: string;
    permalink_url?: string;
    created_time?: string;
    comments?: {
      data: Array<{
        id: string;
        message: string;
        from?: { name: string; id: string };
        created_time: string;
        like_count?: number;
        comment_count?: number;
        permalink_url?: string;
        comments?: { data: FbCommentReply[] };
      }>;
    };
  }>(`/${pageId}/feed`, {
    accessToken: pageAccessToken,
    params: {
      fields:
        "id,message,permalink_url,created_time,comments{id,message,from,created_time,like_count,comment_count,permalink_url,comments{id,message,from,created_time,like_count}}",
      limit: String(Math.min(limit, 25)),
    },
  });

  console.log(`[FB Comments] Got ${posts.length} posts from feed`);

  const comments: FbComment[] = [];
  for (const post of posts) {
    const postCommentCount = post.comments?.data?.length ?? 0;
    if (postCommentCount > 0) {
      console.log(`[FB Comments] Post ${post.id}: ${postCommentCount} comments`);
    }
    if (!post.comments?.data) continue;
    for (const c of post.comments.data) {
      comments.push({
        id: c.id,
        message: c.message,
        from: c.from,
        created_time: c.created_time,
        like_count: c.like_count ?? 0,
        comment_count: c.comment_count,
        permalink_url: c.permalink_url,
        post_id: post.id,
        post_message: post.message?.slice(0, 80),
        post_permalink: post.permalink_url,
        replies: c.comments?.data ?? [],
      });
    }
  }

  console.log(`[FB Comments] Total comments collected: ${comments.length}`);
  return comments.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime());
}

// ==================== Reply functions ====================

/**
 * תגובה לתגובה/פוסט בפייסבוק
 * POST /{object_id}/comments?message={text}
 */
export async function replyToFbComment(objectId: string, message: string, pageAccessToken: string) {
  console.log(`[FB Reply] Replying to ${objectId}`);
  return metaApiPost<{ id: string }>(`/${objectId}/comments`, { message }, { accessToken: pageAccessToken });
}

/**
 * שליחת הודעה ב-Messenger בשם העמוד
 * POST /{page_id}/messages עם recipient.id = USER_PSID ו-message.text
 */
export async function sendFbMessage(pageId: string, recipientPsid: string, message: string, pageAccessToken: string) {
  console.log(`[FB Message] Sending from page ${pageId} to PSID ${recipientPsid}`);
  return metaApiPost<{ recipient_id: string; message_id: string }>(
    `/${pageId}/messages`,
    {
      recipient: JSON.stringify({ id: recipientPsid }),
      message: JSON.stringify({ text: message }),
      messaging_type: "RESPONSE",
    },
    { accessToken: pageAccessToken }
  );
}

/**
 * תגובה לתגובה באינסטגרם
 * POST /{comment_id}/replies?message={text}
 */
export async function replyToIgComment(commentId: string, message: string, pageAccessToken: string) {
  console.log(`[IG Reply] Replying to ${commentId}`);
  return metaApiPost<{ id: string }>(`/${commentId}/replies`, { message }, { accessToken: pageAccessToken });
}

/**
 * שליפת page access token מה-Graph API (למקרה שלא נשמר ב-extraData)
 * GET /{page_id}?fields=access_token
 */
export async function fetchPageAccessToken(pageId: string, userAccessToken: string): Promise<string | null> {
  try {
    console.log(`[FB Page Token] Fetching token for page ${pageId}`);
    const res = await metaApiGet<{ access_token?: string }>(`/${pageId}`, {
      accessToken: userAccessToken,
      params: { fields: "access_token" },
    });
    return res.access_token ?? null;
  } catch (err) {
    console.error(`[FB Page Token] Failed to fetch:`, err);
    return null;
  }
}

/**
 * שליחת הודעה ב-Instagram DM בשם העמוד
 * POST /{ig_account_id}/messages עם recipient.id = IGSID ו-message.text
 */
export async function sendIgMessage(igAccountId: string, recipientId: string, message: string, pageAccessToken: string) {
  console.log(`[IG Message] Sending from IG ${igAccountId} to ${recipientId}`);
  return metaApiPost<{ id: string }>(
    `/${igAccountId}/messages`,
    {
      recipient: JSON.stringify({ id: recipientId }),
      message: JSON.stringify({ text: message }),
    },
    { accessToken: pageAccessToken }
  );
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
