// משפך הלידים (הטאב הפנימי) — רשימה ומספרים. המנוע המשותף יושב ב-lib/prospect/funnel-data.
// אדמין ומנהלים בלבד.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api-guard";
import { loadFunnel } from "@/lib/prospect/funnel-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireRole(["admin", "manager"]);
  if (guard instanceof NextResponse) return guard;

  const days = Number(new URL(req.url).searchParams.get("days")) || 0;
  const appBase = process.env.APP_BASE_URL ?? new URL(req.url).origin;
  const data = await loadFunnel(days, appBase);
  return NextResponse.json(data);
}
