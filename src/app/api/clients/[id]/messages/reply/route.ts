import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import {
  fetchPageAccessToken,
  replyToFbComment,
  sendFbMessage,
  replyToIgComment,
  sendIgMessage,
} from "@/lib/api/meta/messages";

const ALLOWED_ROLES = new Set(["admin", "manager", "campaignManager"]);

async function getOrFetchPageToken(
  assetId: string,
  pageId: string,
  extraData: string,
  userToken: string
): Promise<string> {
  const extra = JSON.parse(extraData ?? "{}");
  if (extra.pageAccessToken) return extra.pageAccessToken as string;

  const pageToken = await fetchPageAccessToken(pageId, userToken);
  if (!pageToken) return userToken;

  await prisma.platformAsset.update({
    where: { id: assetId },
    data: { extraData: JSON.stringify({ ...extra, pageAccessToken: pageToken }) },
  });
  return pageToken;
}

/**
 * POST /api/clients/[id]/messages/reply
 * body: { type: "fb_comment" | "fb_message" | "ig_comment", targetId, message }
 *  - fb_comment: targetId = comment_id (or post_id)
 *  - fb_message: targetId = conversation cache externalId (PSID נשלף מ-DB)
 *  - ig_comment: targetId = ig comment id
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  if (!ALLOWED_ROLES.has(auth.role)) {
    return NextResponse.json({ error: "אין הרשאה לתגובה" }, { status: 403 });
  }

  const { id: clientId } = await params;
  const body = await req.json();
  const { type, targetId, message } = body as { type: string; targetId: string; message: string };

  if (!type || !targetId || !message?.trim()) {
    return NextResponse.json({ error: "חסרים שדות" }, { status: 400 });
  }

  console.log(`[Reply API] type=${type} targetId=${targetId} clientId=${clientId}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: {
      assets: { where: { isSelected: true, assetType: { in: ["facebook_page", "instagram"] } } },
    },
  });

  if (!connection) {
    return NextResponse.json({ error: "אין חיבור Meta פעיל" }, { status: 404 });
  }

  const pageAsset = connection.assets.find((a) => a.assetType === "facebook_page");
  if (!pageAsset) {
    return NextResponse.json({ error: "לא נבחר עמוד פייסבוק" }, { status: 400 });
  }

  try {
    const pageToken = await getOrFetchPageToken(
      pageAsset.id,
      pageAsset.externalId,
      pageAsset.extraData,
      connection.accessToken
    );

    let result: { id?: string; message_id?: string; recipient_id?: string };

    if (type === "fb_comment") {
      result = await replyToFbComment(targetId, message, pageToken);
    } else if (type === "fb_message") {
      // שלוף PSID של המשתמש מה-cache
      const conv = await prisma.fbConversationCache.findFirst({
        where: { clientId, externalId: targetId },
      });
      if (!conv) {
        return NextResponse.json({ error: "שיחה לא נמצאה ב-cache. רענן את הטאב." }, { status: 404 });
      }
      if (!conv.participantPsid) {
        return NextResponse.json({ error: "לא נמצא PSID למשתמש בשיחה הזו" }, { status: 400 });
      }
      console.log(`[Reply API] FB message to PSID=${conv.participantPsid}`);
      result = await sendFbMessage(pageAsset.externalId, conv.participantPsid, message, pageToken);

      // עדכן את ה-cache עם ההודעה החדשה
      const messages = JSON.parse(conv.messagesJson || "[]") as Array<unknown>;
      const newMsg = {
        id: result.message_id ?? `local_${Date.now()}`,
        message,
        from: { name: "אתם", id: pageAsset.externalId },
        created_time: new Date().toISOString(),
        _own: true,
      };
      await prisma.fbConversationCache.update({
        where: { id: conv.id },
        data: {
          messagesJson: JSON.stringify([newMsg, ...messages]),
          messageCount: conv.messageCount + 1,
          updatedTime: new Date(),
        },
      });
    } else if (type === "ig_message") {
      // שליחת הודעת DM באינסטגרם
      const igAsset = connection.assets.find((a) => a.assetType === "instagram");
      if (!igAsset) {
        return NextResponse.json({ error: "לא נבחר חשבון אינסטגרם" }, { status: 400 });
      }
      const conv = await prisma.igConversationCache.findFirst({
        where: { clientId, externalId: targetId },
      });
      if (!conv?.participantId) {
        return NextResponse.json({ error: "לא נמצא IGSID למשתמש. רענן את הטאב." }, { status: 400 });
      }
      result = await sendIgMessage(igAsset.externalId, conv.participantId, message, pageToken);

      // עדכון cache
      const igMessages = JSON.parse(conv.messagesJson || "[]") as Array<unknown>;
      const newIgMsg = {
        id: result.id ?? `local_${Date.now()}`,
        message,
        from: { name: "אתם", username: "אתם", id: igAsset.externalId },
        created_time: new Date().toISOString(),
        _own: true,
      };
      await prisma.igConversationCache.update({
        where: { id: conv.id },
        data: {
          messagesJson: JSON.stringify([newIgMsg, ...igMessages]),
          messageCount: conv.messageCount + 1,
          updatedTime: new Date(),
        },
      });
    } else if (type === "ig_comment") {
      result = await replyToIgComment(targetId, message, pageToken);

      // עדכן cache של תגובות IG
      const cached = await prisma.igCommentCache.findFirst({
        where: { clientId, externalId: targetId },
      });
      if (cached) {
        const replies = JSON.parse(cached.repliesJson || "[]") as Array<unknown>;
        const newReply = {
          id: result.id ?? `local_${Date.now()}`,
          text: message,
          from: { username: "אתם", id: "" },
          timestamp: new Date().toISOString(),
          _own: true,
        };
        await prisma.igCommentCache.update({
          where: { id: cached.id },
          data: { repliesJson: JSON.stringify([...replies, newReply]) },
        });
      }
    } else {
      return NextResponse.json({ error: "סוג לא תקין" }, { status: 400 });
    }

    // עדכון cache של תגובות פייסבוק
    if (type === "fb_comment") {
      const cached = await prisma.fbCommentCache.findFirst({
        where: { clientId, externalId: targetId },
      });
      if (cached) {
        const replies = JSON.parse(cached.repliesJson || "[]") as Array<unknown>;
        const newReply = {
          id: result.id ?? `local_${Date.now()}`,
          message,
          from: { name: "אתם", id: pageAsset.externalId },
          created_time: new Date().toISOString(),
          _own: true,
        };
        await prisma.fbCommentCache.update({
          where: { id: cached.id },
          data: { repliesJson: JSON.stringify([...replies, newReply]) },
        });
      }
    }

    console.log(`[Reply API] Success:`, result);
    return NextResponse.json({ ok: true, id: result.id ?? result.message_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[Reply API] Error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
