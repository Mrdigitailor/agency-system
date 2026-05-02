import { NextResponse } from "next/server";

// Simple health check — no auth required
export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    cronSecretSet: !!process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
