import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    cronSecretSet: !!process.env.CRON_SECRET,
  });
}

export const dynamic = "force-dynamic";
