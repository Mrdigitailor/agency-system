import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import {
  fetchPageConversations,
  fetchPageComments,
  fetchIgComments,
  fetchPageAccessToken,
} from "@/lib/api/meta/messages";

/**
 * מחזיר page access token לעמוד — אם אין ב-extraData, שולף מה-API ושומר.
 */
async function getOrFetchPageToken(
  assetId: string,
  pageId: string,
  extraData: string,
  userToken: string
): Promise<string> {
  const extra = JSON.parse(extraData ?? "{}");
  if (extra.pageAccessToken) {
    console.log(`[Page Token] Using cached page token for ${pageId}`);
    return extra.pageAccessToken as string;
  }

  console.log(`[Page Token] No cached page token for ${pageId} — fetching from API`);
  const pageToken = await fetchPageAccessToken(pageId, userToken);
  if (!pageToken) {
    console.warn(`[Page Token] Could not fetch page token, falling back to user token`);
    return userToken;
  }

  // שמור ב-DB לפעם הבאה
  await prisma.platformAsset.update({
    where: { id: assetId },
    data: { extraData: JSON.stringify({ ...extra, pageAccessToken: pageToken }) },
  });
  console.log(`[Page Token] Saved page token to DB for asset ${assetId}`);
  return pageToken;
}

/**
 * GET /api/clients/[id]/messages?type=fb_messages|fb_comments|ig_comments
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "fb_messages";

  console.log(`[Messages API] GET clientId=${clientId} type=${type}`);

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: {
      assets: { where: { isSelected: true, assetType: { in: ["facebook_page", "instagram"] } } },
    },
  });

  if (!connection) {
    return NextResponse.json({ data: [], error: "אין חיבור Meta פעיל" });
  }

  const pageAsset = connection.assets.find((a) => a.assetType === "facebook_page");
  const igAsset = connection.assets.find((a) => a.assetType === "instagram");

  try {
    if (type === "fb_messages") {
      if (!pageAsset) return NextResponse.json({ data: [], error: "לא נבחר עמוד פייסבוק" });
      const pageToken = await getOrFetchPageToken(pageAsset.id, pageAsset.externalId, pageAsset.extraData, connection.accessToken);
      const conversations = await fetchPageConversations(pageAsset.externalId, pageToken);
      return NextResponse.json({ data: conversations });
    }

    if (type === "fb_comments") {
      if (!pageAsset) return NextResponse.json({ data: [], error: "לא נבחר עמוד פייסבוק" });
      console.log(`[Messages API] FB comments — pageId=${pageAsset.externalId}`);
      const pageToken = await getOrFetchPageToken(pageAsset.id, pageAsset.externalId, pageAsset.extraData, connection.accessToken);
      const comments = await fetchPageComments(pageAsset.externalId, pageToken);
      console.log(`[Messages API] Returning ${comments.length} FB comments`);
      return NextResponse.json({ data: comments });
    }

    if (type === "ig_comments") {
      if (!igAsset) return NextResponse.json({ data: [], error: "לא נבחר חשבון אינסטגרם" });
      // IG דורש page token של העמוד המקושר
      const igPageToken = pageAsset
        ? await getOrFetchPageToken(pageAsset.id, pageAsset.externalId, pageAsset.extraData, connection.accessToken)
        : connection.accessToken;
      const comments = await fetchIgComments(igAsset.externalId, igPageToken);
      return NextResponse.json({ data: comments });
    }

    return NextResponse.json({ data: [], error: "סוג לא תקין" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[Messages API] Error:`, msg);
    if (msg.startsWith("PERMISSION_MISSING:")) {
      const perm = msg.split(":")[1];
      return NextResponse.json({ data: [], permissionError: `נדרשת הרשאה: ${perm}` });
    }
    return NextResponse.json({ data: [], error: msg });
  }
}
