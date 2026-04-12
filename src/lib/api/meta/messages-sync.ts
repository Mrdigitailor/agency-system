// Sync logic — שואב הודעות/תגובות מ-Meta ושומר ב-DB cache

import { prisma } from "@/lib/db/prisma";
import { metaApiGetAll, metaApiGet } from "./client";
import { fetchPageAccessToken } from "./messages";

/* ============ Helpers ============ */

async function getOrFetchPageToken(
  assetId: string,
  pageId: string,
  extraData: string,
  userToken: string
): Promise<string> {
  const extra = JSON.parse(extraData ?? "{}");
  if (extra.pageAccessToken) return extra.pageAccessToken as string;

  console.log(`[Sync] No cached page token for ${pageId} — fetching from /me/accounts`);

  // נסיון 1 — /me/accounts (זה הדרך הנכונה)
  try {
    const pages = await metaApiGet<{ data: Array<{ id: string; access_token: string }> }>(
      "/me/accounts",
      { accessToken: userToken, params: { fields: "id,access_token" } }
    );
    const matching = pages.data?.find((p) => p.id === pageId);
    if (matching?.access_token) {
      await prisma.platformAsset.update({
        where: { id: assetId },
        data: { extraData: JSON.stringify({ ...extra, pageAccessToken: matching.access_token }) },
      });
      console.log(`[Sync] Saved page token via /me/accounts for ${pageId}`);
      return matching.access_token;
    }
  } catch (err) {
    console.warn(`[Sync] /me/accounts failed:`, err);
  }

  // נסיון 2 — fallback ישיר
  const fallback = await fetchPageAccessToken(pageId, userToken);
  if (fallback) {
    await prisma.platformAsset.update({
      where: { id: assetId },
      data: { extraData: JSON.stringify({ ...extra, pageAccessToken: fallback }) },
    });
    return fallback;
  }

  console.warn(`[Sync] All page token attempts failed — falling back to user token for ${pageId}`);
  return userToken;
}

function safeDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* ============ Sync FB Messages (Conversations) ============ */

export async function syncFbMessages(clientId: string): Promise<{ count: number; error?: string }> {
  console.log(`[Sync FB Messages] Starting for client ${clientId}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "facebook_page" } } },
  });
  if (!connection) return { count: 0, error: "אין חיבור Meta פעיל" };

  const pageAsset = connection.assets[0];
  if (!pageAsset) return { count: 0, error: "לא נבחר עמוד פייסבוק" };

  const pageToken = await getOrFetchPageToken(
    pageAsset.id,
    pageAsset.externalId,
    pageAsset.extraData,
    connection.accessToken
  );

  try {
    const conversations = await metaApiGetAll<{
      id: string;
      updated_time: string;
      message_count: number;
      snippet?: string;
      participants?: { data: Array<{ name: string; id: string }> };
      messages?: { data: Array<{ id: string; message: string; from?: { name: string; id: string }; created_time: string }> };
    }>(`/${pageAsset.externalId}/conversations`, {
      accessToken: pageToken,
      params: {
        fields: "participants,updated_time,message_count,snippet,messages.limit(20){message,from,created_time}",
        limit: "20",
      },
    });

    console.log(`[Sync FB Messages] Got ${conversations.length} conversations`);

    for (const conv of conversations) {
      // PSID = id של משתתף שהוא לא העמוד
      const userParticipant = conv.participants?.data?.find((p) => p.id !== pageAsset.externalId);
      const participantName = conv.participants?.data?.map((p) => p.name).join(", ") ?? "";
      const userPsid = userParticipant?.id ?? "";

      await prisma.fbConversationCache.upsert({
        where: { clientId_externalId: { clientId, externalId: conv.id } },
        update: {
          participantName,
          participantPsid: userPsid,
          snippet: conv.snippet ?? "",
          messageCount: conv.message_count ?? 0,
          updatedTime: safeDate(conv.updated_time),
          messagesJson: JSON.stringify(conv.messages?.data ?? []),
          lastSyncAt: new Date(),
        },
        create: {
          clientId,
          pageId: pageAsset.externalId,
          externalId: conv.id,
          participantName,
          participantPsid: userPsid,
          snippet: conv.snippet ?? "",
          messageCount: conv.message_count ?? 0,
          updatedTime: safeDate(conv.updated_time),
          messagesJson: JSON.stringify(conv.messages?.data ?? []),
        },
      });
    }

    await prisma.messageSyncStatus.upsert({
      where: { clientId_type: { clientId, type: "fb_messages" } },
      update: { lastSyncAt: new Date(), recordCount: conversations.length, errorMsg: "" },
      create: { clientId, type: "fb_messages", lastSyncAt: new Date(), recordCount: conversations.length },
    });

    return { count: conversations.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[Sync FB Messages] Error:`, msg);
    await prisma.messageSyncStatus.upsert({
      where: { clientId_type: { clientId, type: "fb_messages" } },
      update: { errorMsg: msg },
      create: { clientId, type: "fb_messages", errorMsg: msg },
    });
    return { count: 0, error: msg };
  }
}

/* ============ Sync FB Comments (organic + ads) ============ */

type CommentData = {
  id: string;
  message: string;
  from?: { name: string; id: string };
  created_time: string;
  like_count?: number;
  comment_count?: number;
  permalink_url?: string;
  comments?: { data: Array<{ id: string; message: string; from?: { name: string; id: string }; created_time: string; like_count?: number }> };
};

async function upsertComment(
  clientId: string,
  pageId: string,
  postId: string,
  postMessage: string,
  postPermalink: string,
  source: "organic" | "ad",
  adName: string,
  c: CommentData
) {
  await prisma.fbCommentCache.upsert({
    where: { clientId_externalId: { clientId, externalId: c.id } },
    update: {
      postId,
      postMessage,
      postPermalink,
      message: c.message ?? "",
      fromName: c.from?.name ?? "",
      fromId: c.from?.id ?? "",
      createdTime: safeDate(c.created_time),
      likeCount: c.like_count ?? 0,
      commentCount: c.comment_count ?? 0,
      permalinkUrl: c.permalink_url ?? "",
      repliesJson: JSON.stringify(c.comments?.data ?? []),
      source,
      adName,
      lastSyncAt: new Date(),
    },
    create: {
      clientId,
      pageId,
      externalId: c.id,
      postId,
      postMessage,
      postPermalink,
      message: c.message ?? "",
      fromName: c.from?.name ?? "",
      fromId: c.from?.id ?? "",
      createdTime: safeDate(c.created_time),
      likeCount: c.like_count ?? 0,
      commentCount: c.comment_count ?? 0,
      permalinkUrl: c.permalink_url ?? "",
      repliesJson: JSON.stringify(c.comments?.data ?? []),
      source,
      adName,
    },
  });
}

export async function syncFbComments(clientId: string): Promise<{ count: number; error?: string }> {
  console.log(`[Sync FB Comments] Starting for client ${clientId}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: {
      assets: {
        where: { isSelected: true, assetType: { in: ["facebook_page", "ad_account"] } },
      },
    },
  });
  if (!connection) return { count: 0, error: "אין חיבור Meta פעיל" };

  const pageAsset = connection.assets.find((a) => a.assetType === "facebook_page");
  if (!pageAsset) return { count: 0, error: "לא נבחר עמוד פייסבוק" };

  const adAccountAsset = connection.assets.find((a) => a.assetType === "ad_account");

  const pageToken = await getOrFetchPageToken(
    pageAsset.id,
    pageAsset.externalId,
    pageAsset.extraData,
    connection.accessToken
  );

  let total = 0;

  // ========== שלב 1: תגובות מפוסטים אורגניים ==========
  try {
    const posts = await metaApiGetAll<{
      id: string;
      message?: string;
      permalink_url?: string;
      created_time?: string;
      comments?: { data: CommentData[] };
    }>(`/${pageAsset.externalId}/feed`, {
      accessToken: pageToken,
      params: {
        fields:
          "id,message,permalink_url,created_time,comments{id,message,from,created_time,like_count,comment_count,permalink_url,comments{id,message,from,created_time,like_count}}",
        limit: "25",
      },
    });

    console.log(`[Sync FB Comments] Got ${posts.length} organic posts`);

    for (const post of posts) {
      if (!post.comments?.data) continue;
      for (const c of post.comments.data) {
        await upsertComment(
          clientId,
          pageAsset.externalId,
          post.id,
          post.message?.slice(0, 200) ?? "",
          post.permalink_url ?? "",
          "organic",
          "",
          c
        );
        total++;
      }
    }
    console.log(`[Sync FB Comments] Organic comments: ${total}`);
  } catch (err) {
    console.error(`[Sync FB Comments] Organic fetch error:`, err instanceof Error ? err.message : err);
  }

  // ========== שלב 2: תגובות ממודעות ==========
  if (adAccountAsset) {
    try {
      console.log(`[Sync FB Comments] Fetching ads from ${adAccountAsset.externalId}`);
      const ads = await metaApiGetAll<{
        id: string;
        name: string;
        status: string;
        creative?: { effective_object_story_id?: string };
      }>(`/${adAccountAsset.externalId}/ads`, {
        accessToken: connection.accessToken,
        params: {
          fields: "id,name,status,creative{effective_object_story_id}",
          filtering: JSON.stringify([{
            field: "effective_status",
            operator: "IN",
            value: ["ACTIVE", "PAUSED"],
          }]),
          limit: "100",
        },
      });

      console.log(`[Sync FB Comments] Got ${ads.length} ads`);

      let adComments = 0;
      for (const ad of ads) {
        const storyId = ad.creative?.effective_object_story_id;
        if (!storyId) continue;

        try {
          const comments = await metaApiGetAll<CommentData>(`/${storyId}/comments`, {
            accessToken: pageToken,
            params: {
              fields:
                "id,message,from,created_time,like_count,comment_count,permalink_url,comments{id,message,from,created_time,like_count}",
              limit: "50",
            },
          });

          for (const c of comments) {
            await upsertComment(
              clientId,
              pageAsset.externalId,
              storyId,
              ad.name?.slice(0, 200) ?? "",
              "", // מודעות לא תמיד יש permalink
              "ad",
              ad.name ?? "",
              c
            );
            adComments++;
            total++;
          }
        } catch (err) {
          // שגיאה בודדת על מודעה — ממשיכים הלאה
          console.warn(`[Sync FB Comments] Could not fetch comments for ad story ${storyId}:`, err instanceof Error ? err.message : err);
        }
      }
      console.log(`[Sync FB Comments] Ad comments: ${adComments}`);
    } catch (err) {
      console.error(`[Sync FB Comments] Ads fetch error:`, err instanceof Error ? err.message : err);
      // לא מחזירים שגיאה — אורגניים אולי נטענו בהצלחה
    }
  } else {
    console.log(`[Sync FB Comments] No ad account selected — skipping ads`);
  }

  console.log(`[Sync FB Comments] Total comments saved: ${total}`);

  await prisma.messageSyncStatus.upsert({
    where: { clientId_type: { clientId, type: "fb_comments" } },
    update: { lastSyncAt: new Date(), recordCount: total, errorMsg: "" },
    create: { clientId, type: "fb_comments", lastSyncAt: new Date(), recordCount: total },
  });

  return { count: total };
}

/* ============ Sync IG Comments ============ */

export async function syncIgComments(clientId: string): Promise<{ count: number; error?: string }> {
  console.log(`[Sync IG Comments] Starting for client ${clientId}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: {
      assets: { where: { isSelected: true, assetType: { in: ["facebook_page", "instagram"] } } },
    },
  });
  if (!connection) return { count: 0, error: "אין חיבור Meta פעיל" };

  const igAsset = connection.assets.find((a) => a.assetType === "instagram");
  const pageAsset = connection.assets.find((a) => a.assetType === "facebook_page");
  if (!igAsset) return { count: 0, error: "לא נבחר חשבון אינסטגרם" };

  // IG דורש page token של העמוד המקושר
  const token = pageAsset
    ? await getOrFetchPageToken(pageAsset.id, pageAsset.externalId, pageAsset.extraData, connection.accessToken)
    : connection.accessToken;

  try {
    const media = await metaApiGetAll<{
      id: string;
      caption?: string;
      comments?: {
        data: Array<{
          id: string;
          text: string;
          from?: { username: string; id: string };
          timestamp: string;
          like_count?: number;
          replies?: { data: Array<{ id: string; text: string; from?: { username: string; id: string }; timestamp: string; like_count?: number }> };
        }>;
      };
    }>(`/${igAsset.externalId}/media`, {
      accessToken: token,
      params: {
        fields: "id,caption,comments.limit(50){id,text,from,timestamp,like_count,replies{id,text,from,timestamp,like_count}}",
        limit: "25",
      },
    });

    console.log(`[Sync IG Comments] Got ${media.length} media`);

    let total = 0;
    for (const m of media) {
      if (!m.comments?.data) continue;
      for (const c of m.comments.data) {
        await prisma.igCommentCache.upsert({
          where: { clientId_externalId: { clientId, externalId: c.id } },
          update: {
            mediaId: m.id,
            mediaCaption: m.caption?.slice(0, 200) ?? "",
            text: c.text ?? "",
            fromUsername: c.from?.username ?? "",
            fromId: c.from?.id ?? "",
            timestamp: safeDate(c.timestamp),
            likeCount: c.like_count ?? 0,
            repliesJson: JSON.stringify(c.replies?.data ?? []),
            lastSyncAt: new Date(),
          },
          create: {
            clientId,
            igAccountId: igAsset.externalId,
            externalId: c.id,
            mediaId: m.id,
            mediaCaption: m.caption?.slice(0, 200) ?? "",
            text: c.text ?? "",
            fromUsername: c.from?.username ?? "",
            fromId: c.from?.id ?? "",
            timestamp: safeDate(c.timestamp),
            likeCount: c.like_count ?? 0,
            repliesJson: JSON.stringify(c.replies?.data ?? []),
          },
        });
        total++;
      }
    }

    console.log(`[Sync IG Comments] Total comments saved: ${total}`);

    await prisma.messageSyncStatus.upsert({
      where: { clientId_type: { clientId, type: "ig_comments" } },
      update: { lastSyncAt: new Date(), recordCount: total, errorMsg: "" },
      create: { clientId, type: "ig_comments", lastSyncAt: new Date(), recordCount: total },
    });

    return { count: total };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[Sync IG Comments] Error:`, msg);
    await prisma.messageSyncStatus.upsert({
      where: { clientId_type: { clientId, type: "ig_comments" } },
      update: { errorMsg: msg },
      create: { clientId, type: "ig_comments", errorMsg: msg },
    });
    return { count: 0, error: msg };
  }
}
