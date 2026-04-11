import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import {
  fetchPageAccessToken,
  replyToFbComment,
  sendFbMessage,
  replyToIgComment,
} from "@/lib/api/meta/messages";

const ALLOWED_ROLES = new Set(["admin", "manager", "campaignManager"]);

/**
 * שליפה/שמירה של page access token ספציפי לעמוד
 */
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
 * body: { type: "fb_comment" | "fb_message" | "ig_comment", targetId: string, message: string }
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

    let result;
    if (type === "fb_comment") {
      result = await replyToFbComment(targetId, message, pageToken);
    } else if (type === "fb_message") {
      result = await sendFbMessage(targetId, message, pageToken);
    } else if (type === "ig_comment") {
      result = await replyToIgComment(targetId, message, pageToken);
    } else {
      return NextResponse.json({ error: "סוג לא תקין" }, { status: 400 });
    }

    console.log(`[Reply API] Success:`, result);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[Reply API] Error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
