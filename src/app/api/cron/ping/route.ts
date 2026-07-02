import { NextResponse } from "next/server";

// Simple health check — no auth required (בלי חשיפת קונפיגורציה)
export async function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
