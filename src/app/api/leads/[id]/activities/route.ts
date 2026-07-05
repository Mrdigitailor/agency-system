import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

/**
 * ציר הפעילות של ליד — GET רשימה, POST הוספת הערה.
 * מעברי סטטוס ואירועי הצעה נרשמים אוטומטית ב-PATCH של הליד.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const activities = await prisma.leadActivity.findMany({
    where: { leadId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(activities);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const user = auth as AuthUser;

  const { id } = await params;
  const body = await req.json();
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const activity = await prisma.leadActivity.create({
    data: {
      leadId: id,
      type: body.type === "system" ? "note" : (body.type ?? "note"), // system שמור ללוג אוטומטי
      text,
      author: user.name ?? "",
    },
  });
  return NextResponse.json(activity, { status: 201 });
}
