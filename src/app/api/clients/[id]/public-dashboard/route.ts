import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import crypto from "crypto";

/**
 * POST /api/clients/[id]/public-dashboard — generate/toggle public link
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();

  if (body.action === "generate") {
    const token = crypto.randomUUID();
    await prisma.client.update({
      where: { id },
      data: { publicDashboardToken: token, publicDashboardEnabled: true },
    });
    return NextResponse.json({ token, enabled: true });
  }

  if (body.action === "disable") {
    await prisma.client.update({
      where: { id },
      data: { publicDashboardEnabled: false },
    });
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
