import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * ניתוק חיבור Meta של לקוח — מוחק את כל הנתונים שנשאבו
 * DELETE /api/platforms/meta/disconnect/[clientId]
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  console.log(`[Meta Disconnect] Deleting all Meta data for client ${clientId}`);

  // מחיקת כל הנתונים שנשאבו מ-Meta
  const [insights, creatives, posts, igMedia, fbConv, fbComments, igConv, igComments, syncStatus] = await Promise.all([
    prisma.metaInsightDaily.deleteMany({ where: { clientId } }),
    prisma.metaCreative.deleteMany({ where: { clientId } }),
    prisma.metaPagePost.deleteMany({ where: { clientId } }),
    prisma.metaInstagramMedia.deleteMany({ where: { clientId } }),
    prisma.fbConversationCache.deleteMany({ where: { clientId } }),
    prisma.fbCommentCache.deleteMany({ where: { clientId } }),
    prisma.igConversationCache.deleteMany({ where: { clientId } }),
    prisma.igCommentCache.deleteMany({ where: { clientId } }),
    prisma.messageSyncStatus.deleteMany({ where: { clientId } }),
  ]);

  console.log(`[Meta Disconnect] Deleted: ${insights.count} insights, ${creatives.count} creatives, ${posts.count} posts, ${igMedia.count} IG media, ${fbConv.count} FB conversations, ${fbComments.count} FB comments, ${igConv.count} IG conversations, ${igComments.count} IG comments`);

  // מחיקת נכסים + חיבור
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta" },
    select: { id: true },
  });

  if (connection) {
    await prisma.platformAsset.deleteMany({ where: { connectionId: connection.id } });
    await prisma.platformConnection.delete({ where: { id: connection.id } });
    console.log(`[Meta Disconnect] Deleted connection + assets`);
  }

  return NextResponse.json({ ok: true });
}
