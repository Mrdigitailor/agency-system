import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseSignedRequest, deleteUserData } from "@/lib/api/meta/data-deletion";

export const dynamic = "force-dynamic";

/**
 * Meta Data Deletion Callback.
 * פייסבוק שולח POST עם signed_request כשמשתמש מבקש למחוק את נתוניו.
 * מאמתים, מוחקים את רשומות ה-cache התואמות, ומחזירים url + confirmation_code
 * (פורמט חובה של Meta) שמפנה לדף מעקב הסטטוס.
 */
export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET ?? "";
  if (!appSecret) {
    console.error("[DataDeletion] META_APP_SECRET missing");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let signedRequest = "";
  try {
    const form = await req.formData();
    signedRequest = String(form.get("signed_request") ?? "");
  } catch {
    // ייתכן שנשלח כ-JSON
    try {
      const body = await req.json();
      signedRequest = String(body.signed_request ?? "");
    } catch {
      signedRequest = "";
    }
  }

  if (!signedRequest) return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });

  const data = parseSignedRequest(signedRequest, appSecret);
  if (!data?.user_id) return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });

  const confirmationCode = `del_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  let deletedCount = 0;
  try {
    deletedCount = await deleteUserData(data.user_id);
  } catch (e) {
    console.error("[DataDeletion] delete failed:", e);
  }

  await prisma.dataDeletionRequest.create({
    data: { confirmationCode, metaUserId: data.user_id, deletedCount, status: "completed" },
  }).catch((e) => console.error("[DataDeletion] log failed:", e));

  console.log(`[DataDeletion] user=${data.user_id} deleted=${deletedCount} code=${confirmationCode}`);

  const host = req.headers.get("host") ?? "";
  const statusUrl = `https://${host}/data-deletion?code=${confirmationCode}`;

  // פורמט התשובה שפייסבוק דורש
  return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode });
}
