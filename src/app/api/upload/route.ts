import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * POST /api/upload — upload PDF proposal for a lead
 * Body: FormData with file + leadId
 * Stores as base64 in DB (works on Vercel serverless)
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

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files allowed" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    console.log(`[Upload] Converted to base64: ${(base64.length / 1024).toFixed(0)}KB`);

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    // Save to DB
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        proposalFileData: base64,
        proposalFileName: file.name,
        proposalUrl: `/api/upload?leadId=${leadId}`, // reference URL, not data URL
        proposalUploadedAt: new Date().toISOString(),
      },
    });
    console.log(`[Upload] ✅ Saved to lead ${leadId}`);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      size: file.size,
    });
  } catch (err) {
    console.error("[Upload] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}

/**
 * GET /api/upload?leadId=XXX — get proposal PDF for a lead
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const leadId = new URL(req.url).searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "Missing leadId" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { proposalFileData: true, proposalFileName: true },
  });

  if (!lead?.proposalFileData) {
    return NextResponse.json({ error: "No proposal found" }, { status: 404 });
  }

  // Return as PDF
  const buffer = Buffer.from(lead.proposalFileData, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${lead.proposalFileName || "proposal.pdf"}"`,
    },
  });
}
