import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAuth } from "@/lib/auth/api-guard";

/**
 * POST /api/upload — Vercel Blob client-side upload handler
 * The browser uploads directly to Blob Storage (no 4.5MB limit).
 * This endpoint only generates the upload token.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log(`[Upload] Blob completed: ${blob.url} (${blob.pathname})`);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("[Upload] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
