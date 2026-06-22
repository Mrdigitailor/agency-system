import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

// רשימת חיבורי פלטפורמות של לקוח
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const { id } = await params;

  const connections = await prisma.platformConnection.findMany({
    where: { clientId: id, isActive: true },
    include: {
      // לא להציג conversion_event ברשימת הנכסים
      assets: { where: { assetType: { not: "conversion_event" } }, orderBy: [{ assetType: "asc" }, { name: "asc" }] },
    },
    orderBy: { connectedAt: "desc" },
  });

  // הסרת tokens מהתגובה לאבטחה
  const now = Date.now();
  const safe = connections.map((c) => ({
    id: c.id,
    platform: c.platform,
    accountName: c.accountName,
    accountEmail: c.accountEmail,
    connectedAt: c.connectedAt,
    lastSyncAt: c.lastSyncAt,
    tokenExpiry: c.tokenExpiry,
    // האם החיבור באמת דורש חיבור מחדש?
    // פלטפורמות עם refresh token (Google Ads, GA4, TikTok) מרעננות את ה-access token
    // אוטומטית — ה-access token חי שעה בלבד ולכן ה-tokenExpiry שלו לא מעיד על תקלה.
    // החיבור "שבור" רק אם אין refresh token (או שנמחק אחרי invalid_grant).
    // פלטפורמות בלי refresh token (Meta — טוקן ארוך-טווח) — שם tokenExpiry הוא הסיגנל האמיתי.
    needsReconnect: c.refreshToken
      ? false
      : c.tokenExpiry
      ? new Date(c.tokenExpiry).getTime() < now
      : false,
    assets: c.assets.map((a) => ({
      id: a.id,
      assetType: a.assetType,
      externalId: a.externalId,
      name: a.name,
      isSelected: a.isSelected,
      extraData: JSON.parse(a.extraData ?? "{}"),
    })),
  }));

  return NextResponse.json(safe);
}
