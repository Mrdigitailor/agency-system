import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";

// הכנת URL לחיבור OAuth
// כרגע placeholder — ב-API האמיתי נייצר state token ונחזיר URL של הפלטפורמה
export async function POST(req: Request, { params }: { params: Promise<{ id: string; platform: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const { id: clientId, platform } = await params;

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/clients/${clientId}/connections/${platform}/callback`;

  // ב-API האמיתי:
  // - Meta: https://www.facebook.com/v18.0/dialog/oauth?client_id=...&redirect_uri=...&scope=ads_management,pages_show_list,instagram_basic&state=...
  // - Google: https://accounts.google.com/o/oauth2/v2/auth?...
  // - TikTok: https://business-api.tiktok.com/portal/auth?...

  let authUrl = "";
  let scopes: string[] = [];

  switch (platform) {
    case "meta":
      scopes = ["ads_management", "ads_read", "pages_show_list", "pages_read_engagement", "instagram_basic", "business_management"];
      authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID ?? "APP_ID_NOT_SET"}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join(",")}&state=${clientId}`;
      break;
    case "google_ads":
      scopes = ["https://www.googleapis.com/auth/adwords", "https://www.googleapis.com/auth/analytics.readonly"];
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_ADS_CLIENT_ID ?? "CLIENT_ID_NOT_SET"}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(" "))}&access_type=offline&state=${clientId}`;
      break;
    case "tiktok":
      scopes = ["user.info.basic", "ad_account.read", "campaign.read"];
      authUrl = `https://business-api.tiktok.com/portal/auth?app_id=${process.env.TIKTOK_APP_ID ?? "APP_ID_NOT_SET"}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${clientId}`;
      break;
    default:
      return NextResponse.json({ error: "פלטפורמה לא נתמכת" }, { status: 400 });
  }

  return NextResponse.json({ authUrl, platform, redirectUri });
}
