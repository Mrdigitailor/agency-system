import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncClientManagers } from "@/lib/utils/syncManagers";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: { optimizations: { orderBy: { createdAt: "desc" } } },
  });
  if (!client || client.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...client,
    platforms: JSON.parse(client.platforms),
    customAssets: JSON.parse(client.customAssets ?? "[]"),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (body.platforms) body.platforms = JSON.stringify(body.platforms);
  if (body.customAssets) body.customAssets = JSON.stringify(body.customAssets);
  const client = await prisma.client.update({ where: { id }, data: body });

  // אם שונו מנהלים — סנכרן את assignedClientIds
  if (body.campaignManager !== undefined || body.accountManager !== undefined) {
    await syncClientManagers(
      id,
      body.campaignManager ?? client.campaignManager ?? "",
      body.accountManager ?? client.accountManager ?? ""
    );
  }

  return NextResponse.json({
    ...client,
    platforms: JSON.parse(client.platforms),
    customAssets: JSON.parse(client.customAssets ?? "[]"),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
