import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { put } from "@vercel/blob";

/**
 * POST /api/upload — upload PDF proposal to Vercel Blob Storage
 * Body: FormData with file + leadId
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const leadId = formData.get("leadId") as string | null;

    console.log(`[Upload] file=${file?.name ?? "none"}, size=${file?.size ?? 0}, leadId=${leadId}`);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 });
    }

    // Upload to Vercel Blob Storage
    const blob = await put(
      `proposals/${leadId}_${Date.now()}_${file.name}`,
      file,
      { access: "public" }
    );

    console.log(`[Upload] ✅ Blob uploaded: ${blob.url}`);

    // Save URL to DB
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        proposalUrl: blob.url,
        proposalFileName: file.name,
        proposalUploadedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      fileName: file.name,
      size: file.size,
    });
  } catch (err) {
    console.error("[Upload] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
