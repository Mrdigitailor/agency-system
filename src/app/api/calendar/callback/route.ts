import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId
  const error = searchParams.get("error");
  const origin = new URL(req.url).origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/calendar?error=${error ?? "missing_params"}`);
  }

  try {
    const redirectUri = `${origin}/api/calendar/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description ?? "No access token");
    }

    // שליפת אימייל
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    await prisma.googleCalendarConnection.upsert({
      where: { userId: state },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? "",
        tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        email: userInfo.email ?? "",
      },
      create: {
        userId: state,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? "",
        tokenExpiry: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        email: userInfo.email ?? "",
      },
    });

    return NextResponse.redirect(`${origin}/calendar?connected=1`);
  } catch (err) {
    console.error("[GCal Callback]", err);
    return NextResponse.redirect(`${origin}/calendar?error=token_exchange`);
  }
}
