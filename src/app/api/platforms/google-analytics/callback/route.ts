import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const origin = new URL(req.url).origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/clients?ga_error=${error ?? "missing_params"}`);
  }

  let decoded: { clientId: string };
  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  } catch {
    return NextResponse.redirect(`${origin}/clients?ga_error=invalid_state`);
  }

  const { clientId } = decoded;
  const isProd = process.env.NODE_ENV === "production";
  const redirectUri = isProd
    ? "https://agency.mr-digitailor.co.il/api/platforms/google-analytics/callback"
    : `${origin}/api/platforms/google-analytics/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description ?? "No token");

    // Save connection
    const conn = await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "ga4" } },
      update: { accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token ?? "", tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null, isActive: true },
      create: { clientId, platform: "ga4", accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token ?? "", tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null },
    });

    // Fetch GA4 properties
    try {
      const summariesRes = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (summariesRes.ok) {
        const summaries = await summariesRes.json();
        for (const account of summaries.accountSummaries ?? []) {
          for (const prop of account.propertySummaries ?? []) {
            const propertyId = prop.property?.replace("properties/", "") ?? "";
            await prisma.platformAsset.upsert({
              where: { connectionId_assetType_externalId: { connectionId: conn.id, assetType: "ga4_property", externalId: propertyId } },
              update: { name: prop.displayName ?? propertyId },
              create: { connectionId: conn.id, assetType: "ga4_property", externalId: propertyId, name: prop.displayName ?? propertyId },
            });
          }
        }
      }
    } catch (err) {
      console.error("[GA Callback] Could not fetch properties:", err);
    }

    return NextResponse.redirect(`${origin}/clients/${clientId}?ga_connected=1`);
  } catch (err) {
    console.error("[GA Callback]", err);
    return NextResponse.redirect(`${origin}/clients/${clientId}?ga_error=${encodeURIComponent(String(err))}`);
  }
}
