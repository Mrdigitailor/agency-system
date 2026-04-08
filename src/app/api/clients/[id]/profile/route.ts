import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";

const JSON_FIELDS = ["products", "awarenessLevels", "audiences", "marketingLanguages", "competitors", "brandColors", "paymentHistory", "documents", "internalNotes"];
const ADMIN_ONLY_FIELDS = ["leadSource", "lifetimeValue", "paymentHistory", "documents"];

function parseJsonFields(profile: Record<string, unknown>): Record<string, unknown> {
  const result = { ...profile };
  for (const field of JSON_FIELDS) {
    if (typeof result[field] === "string") {
      try { result[field] = JSON.parse(result[field] as string); } catch { result[field] = field.endsWith("s") || field === "audiences" ? (field === "audiences" ? {} : []) : ""; }
    }
  }
  return result;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const { id: clientId } = await params;

  let profile = await prisma.clientProfile.findUnique({ where: { clientId } });

  if (!profile) {
    // יצירת פרופיל ריק
    profile = await prisma.clientProfile.create({ data: { clientId } });
  }

  const parsed = parseJsonFields(profile as unknown as Record<string, unknown>);

  // הסתרת שדות admin-only מתפקידים אחרים
  if (user.role !== "admin") {
    for (const field of ADMIN_ONLY_FIELDS) {
      delete parsed[field];
    }
  }

  return NextResponse.json(parsed);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  const user = result as AuthUser;
  const { id: clientId } = await params;

  const body = await req.json();

  // הגנה — לא לאפשר ל-non-admin לערוך שדות מוגבלים
  if (user.role !== "admin") {
    for (const field of ADMIN_ONLY_FIELDS) {
      delete body[field];
    }
  }

  // המרת JSON fields לstrings
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (JSON_FIELDS.includes(key) && typeof value !== "string") {
      data[key] = JSON.stringify(value);
    } else {
      data[key] = value;
    }
  }

  const profile = await prisma.clientProfile.upsert({
    where: { clientId },
    update: data,
    create: { clientId, ...data },
  });

  return NextResponse.json(parseJsonFields(profile as unknown as Record<string, unknown>));
}
