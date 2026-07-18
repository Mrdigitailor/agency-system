import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const optimizations = await prisma.optimization.findMany({
    where: { clientId: id },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(
    optimizations.map((o) => ({
      ...o,
      campaignIds: JSON.parse(o.campaignIds || "[]"),
    }))
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();

  const created = await prisma.optimization.create({
    data: {
      clientId: id,
      date: body.date ?? "",
      platform: body.platform ?? "",
      campaignIds: JSON.stringify(body.campaignIds ?? []),
      actionTaken: body.actionTaken ?? "",
      expectedOutcome: body.expectedOutcome ?? "",
      trackFollowUp: body.trackFollowUp ?? false,
      description: body.actionTaken ?? "", // legacy field — שומר את אותו ערך
    },
  });

  // עדכון lastOptimization על הלקוח
  await prisma.client.update({
    where: { id },
    data: { lastOptimization: body.date ?? "" },
  });

  return NextResponse.json({
    ...created,
    campaignIds: JSON.parse(created.campaignIds || "[]"),
  });
}
