import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

// Edge runtime — no 4.5MB body limit
export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const leadId = formData.get("leadId") as string | null;

    if (!file || !leadId) {
      return NextResponse.json({ error: "Missing file or leadId" }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 });
    }

    const blob = await put(
      `proposals/${leadId}_${Date.now()}_${file.name}`,
      file,
      { access: "public" }
    );

    return NextResponse.json({
      success: true,
      url: blob.url,
      fileName: file.name,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
