import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncFbMessages, syncFbComments, syncIgComments } from "@/lib/api/meta/messages-sync";

const STALE_MS = 5 * 60 * 1000; // 5 דקות — אחרי זה מטריגר רענון ברקע

/**
 * GET /api/clients/[id]/messages?type=fb_messages|fb_comments|ig_comments
 * - מחזיר מיד מה-DB cache
 * - אם cache ישן או ריק — מבצע sync לפני התשובה
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "fb_messages";

  console.log(`[Messages API] GET clientId=${clientId} type=${type}`);

  // בדוק סטטוס סנכרון
  const status = await prisma.messageSyncStatus.findUnique({
    where: { clientId_type: { clientId, type } },
  });

  const isStale = !status?.lastSyncAt || Date.now() - status.lastSyncAt.getTime() > STALE_MS;
  const isEmpty = (status?.recordCount ?? 0) === 0;

  // אם cache ריק — חייבים sync לפני שמחזירים
  if (isEmpty) {
    console.log(`[Messages API] Cache empty — running blocking sync`);
    const syncResult = await runSync(type, clientId);
    if (syncResult.error) {
      const msg = syncResult.error;
      if (msg.startsWith("PERMISSION_MISSING:")) {
        const perm = msg.split(":")[1];
        return NextResponse.json({ data: [], permissionError: `נדרשת הרשאה: ${perm}` });
      }
      return NextResponse.json({ data: [], error: msg });
    }
  } else if (isStale) {
    // Stale — נחזיר cache, ונסנכרן ברקע
    console.log(`[Messages API] Cache stale — triggering background sync`);
    runSync(type, clientId).catch((e) => console.error("[Messages API] Background sync failed:", e));
  } else {
    console.log(`[Messages API] Cache fresh — serving from DB`);
  }

  // החזר מה-DB
  const data = await readFromCache(type, clientId);
  return NextResponse.json({ data, lastSyncAt: status?.lastSyncAt ?? null });
}

/**
 * POST /api/clients/[id]/messages
 * רענון ידני — מבצע sync ומחזיר נתונים מעודכנים
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "fb_messages";

  console.log(`[Messages API] POST sync clientId=${clientId} type=${type}`);

  const syncResult = await runSync(type, clientId);
  if (syncResult.error) {
    const msg = syncResult.error;
    if (msg.startsWith("PERMISSION_MISSING:")) {
      const perm = msg.split(":")[1];
      return NextResponse.json({ data: [], permissionError: `נדרשת הרשאה: ${perm}` });
    }
    return NextResponse.json({ data: [], error: msg });
  }

  const data = await readFromCache(type, clientId);
  return NextResponse.json({ data, lastSyncAt: new Date(), synced: syncResult.count });
}

/* ============ Helpers ============ */

async function runSync(type: string, clientId: string) {
  if (type === "fb_messages") return syncFbMessages(clientId);
  if (type === "fb_comments") return syncFbComments(clientId);
  if (type === "ig_comments") return syncIgComments(clientId);
  return { count: 0, error: "סוג לא תקין" };
}

async function readFromCache(type: string, clientId: string) {
  if (type === "fb_messages") {
    const rows = await prisma.fbConversationCache.findMany({
      where: { clientId },
      orderBy: { updatedTime: "desc" },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.externalId,
      participantPsid: r.participantPsid,
      participants: { data: [{ name: r.participantName, id: r.participantPsid }] },
      snippet: r.snippet,
      message_count: r.messageCount,
      updated_time: r.updatedTime?.toISOString() ?? null,
      messages: { data: JSON.parse(r.messagesJson || "[]") },
    }));
  }

  if (type === "fb_comments") {
    const rows = await prisma.fbCommentCache.findMany({
      where: { clientId },
      orderBy: { createdTime: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.externalId,
      message: r.message,
      from: { name: r.fromName, id: r.fromId },
      created_time: r.createdTime?.toISOString() ?? "",
      like_count: r.likeCount,
      comment_count: r.commentCount,
      permalink_url: r.permalinkUrl,
      post_id: r.postId,
      post_message: r.postMessage,
      post_permalink: r.postPermalink,
      replies: JSON.parse(r.repliesJson || "[]"),
      source: r.source ?? "organic",
      ad_name: r.adName ?? "",
    }));
  }

  if (type === "ig_comments") {
    const rows = await prisma.igCommentCache.findMany({
      where: { clientId },
      orderBy: { timestamp: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.externalId,
      text: r.text,
      from: { username: r.fromUsername, id: r.fromId },
      timestamp: r.timestamp?.toISOString() ?? "",
      like_count: r.likeCount,
      media_id: r.mediaId,
      media_caption: r.mediaCaption,
      replies: JSON.parse(r.repliesJson || "[]"),
    }));
  }

  return [];
}
