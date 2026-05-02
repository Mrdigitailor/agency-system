import { NextResponse } from "next/server";

export async function GET() {
  console.log("[Cron Ping] Hit at", new Date().toISOString());
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    cronSecretSet: !!process.env.CRON_SECRET,
  });
}
