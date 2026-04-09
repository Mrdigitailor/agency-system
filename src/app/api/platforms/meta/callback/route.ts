import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { decodeState, exchangeCodeForToken, exchangeForLongLivedToken, getMeInfo } from "@/lib/api/meta/oauth";

/**
 * OAuth callback — שלב 1: שומר רק token, בלי לשאוב נכסים
 * הנכסים יישאבו ב-lazy loading כשלוחצים "ניהול נכסים"
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const origin = new URL(req.url).origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/clients?meta_error=${error ?? "missing_params"}`);
  }

  const decoded = decodeState(state);
  if (!decoded?.clientId) {
    return NextResponse.redirect(`${origin}/clients?meta_error=invalid_state`);
  }
  const { clientId } = decoded;

  try {
    // 1. החלפת code ל-token
    const shortToken = await exchangeCodeForToken(code, origin);
    if (!shortToken?.access_token) throw new Error("לא התקבל access token");

    // 2. המרה ל-long-lived (60 יום)
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);
    const accessToken = longToken?.access_token ?? shortToken.access_token;
    const expiresIn = longToken?.expires_in ?? shortToken.expires_in ?? 60 * 24 * 60 * 60;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    // 3. פרטי המשתמש
    const meInfo = await getMeInfo(accessToken);

    // 4. שמירה — רק token, בלי נכסים
    await prisma.platformConnection.upsert({
      where: { clientId_platform: { clientId, platform: "meta" } },
      update: { accessToken, tokenExpiry, accountName: meInfo?.name ?? "", accountEmail: meInfo?.email ?? "", isActive: true },
      create: { clientId, platform: "meta", accessToken, tokenExpiry, accountName: meInfo?.name ?? "", accountEmail: meInfo?.email ?? "" },
    });

    return NextResponse.redirect(`${origin}/clients/${clientId}?meta_connected=1`);
  } catch (err) {
    console.error("[Meta Callback]", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(`${origin}/clients/${clientId}?meta_error=${encodeURIComponent(msg)}`);
  }
}
