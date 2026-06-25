import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { getValidGoogleToken } from "@/lib/api/google-ads/client";
import { fetchAnalytics } from "@/lib/api/ga4/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/clients/[id]/analytics?days=28
 * שליפה חיה מ-Google Analytics 4 ל-property הנבחר של הלקוח.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: clientId } = await params;
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 28, 1), 365);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { clientType: true, currency: true },
  });
  const mode = client?.clientType === "ecom" ? "ecom" : "leads";
  const currency = client?.currency || "ILS";

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "ga4", isActive: true },
    include: { assets: { where: { assetType: "ga4_property" } } },
  });

  if (!connection) {
    return NextResponse.json({ connected: false });
  }

  // ה-property הנבחר, או הראשון אם אין סימון
  const property = connection.assets.find((a) => a.isSelected) ?? connection.assets[0];
  if (!property) {
    return NextResponse.json({ connected: true, error: "לא נבחר property של Google Analytics" });
  }

  let token: string;
  try {
    token = await getValidGoogleToken(connection);
  } catch {
    return NextResponse.json({ connected: true, error: "צריך לחבר מחדש את Google Analytics" });
  }

  try {
    const data = await fetchAnalytics(property.externalId, token, days, mode);
    return NextResponse.json({
      connected: true,
      property: { id: property.externalId, name: property.name },
      days,
      currency,
      ...data,
    });
  } catch (err) {
    return NextResponse.json({ connected: true, error: (err as Error).message?.slice(0, 200) });
  }
}
