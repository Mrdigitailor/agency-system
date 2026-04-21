import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/api-guard";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * POST /api/upload — העלאת קובץ (PDF, תמונה וכו')
 * מחזיר { url: "/uploads/filename.pdf" }
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "File type not allowed. Use PDF, JPG, PNG or WebP." }, { status: 400 });
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 10MB." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const ext = file.name.split(".").pop() ?? "pdf";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, uniqueName), buffer);

    const url = `/uploads/${uniqueName}`;
    console.log(`[Upload] File saved: ${url} (${file.name}, ${(file.size / 1024).toFixed(1)}KB)`);

    return NextResponse.json({ url, originalName: file.name });
  } catch (err) {
    console.error("[Upload] Error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
