import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { crmSourceFor } from "@/lib/crm";

// מקור ה-CRM/לידים החיצוני המחובר ללקוח (לתצוגה בסקירה הכללית)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const { id } = await params;
  return NextResponse.json({ crm: crmSourceFor(id) });
}
