import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { fetchPageConversations, fetchPageComments, fetchIgComments } from "@/lib/api/meta/messages";

/**
 * GET /api/clients/[id]/messages?type=fb_messages|fb_comments|ig_comments
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "fb_messages";

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
      const extra = JSON.parse(pageAsset.extraData ?? "{}");
      const pageToken = extra.pageAccessToken ?? connection.accessToken;
      const conversations = await fetchPageConversations(pageAsset.externalId, pageToken);
      return NextResponse.json({ data: conversations });
    }

    if (type === "fb_comments") {
      if (!pageAsset) return NextResponse.json({ data: [], error: "לא נבחר עמוד פייסבוק" });
      const extra = JSON.parse(pageAsset.extraData ?? "{}");
      const pageToken = extra.pageAccessToken ?? connection.accessToken;
      const comments = await fetchPageComments(pageAsset.externalId, pageToken);
      return NextResponse.json({ data: comments });
    }

    if (type === "ig_comments") {
      if (!igAsset) return NextResponse.json({ data: [], error: "לא נבחר חשבון אינסטגרם" });
      const comments = await fetchIgComments(igAsset.externalId, connection.accessToken);
      return NextResponse.json({ data: comments });
    }

    return NextResponse.json({ data: [], error: "סוג לא תקין" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg.startsWith("PERMISSION_MISSING:")) {
      const perm = msg.split(":")[1];
      return NextResponse.json({ data: [], permissionError: `נדרשת הרשאה: ${perm}` });
    }
    return NextResponse.json({ data: [], error: msg });
  }
}
