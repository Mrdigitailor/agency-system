import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import crypto from "crypto";

/** GET — סטטוס שיתוף + token של הדוח */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId, reportId } = await params;
  const report = await prisma.clientReport.findFirst({ where: { id: reportId, clientId }, select: { publicEnabled: true, publicToken: true } });
  if (!report) return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });
  return NextResponse.json({ enabled: report.publicEnabled, token: report.publicToken });
}

/** POST { action: generate | disable } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: clientId, reportId } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const report = await prisma.clientReport.findFirst({ where: { id: reportId, clientId }, select: { id: true, publicToken: true } });
  if (!report) return NextResponse.json({ error: "דוח לא נמצא" }, { status: 404 });

  if (body.action === "generate") {
    const token = report.publicToken ?? crypto.randomUUID();
    await prisma.clientReport.update({ where: { id: reportId }, data: { publicToken: token, publicEnabled: true } });
    return NextResponse.json({ enabled: true, token });
  }
  if (body.action === "disable") {
    await prisma.clientReport.update({ where: { id: reportId }, data: { publicEnabled: false } });
    return NextResponse.json({ enabled: false, token: report.publicToken });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
