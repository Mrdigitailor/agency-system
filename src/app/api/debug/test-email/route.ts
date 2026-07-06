import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireRole } from "@/lib/auth/api-guard";

/**
 * GET /api/debug/test-email
 * בדיקה ישירה של Resend API — שולח מייל בדיקה ל-saar@digitailors.co.il (admin בלבד)
 */
export async function GET() {
  const auth = await requireRole(["admin"]);
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.RESEND_API_KEY;

  console.log("=== [Test Email] START ===");
  console.log(`[Test Email] RESEND_API_KEY exists: ${!!apiKey}`);
  console.log(`[Test Email] RESEND_API_KEY prefix: ${apiKey ? apiKey.substring(0, 10) + "..." : "MISSING"}`);
  console.log(`[Test Email] RESEND_API_KEY length: ${apiKey?.length ?? 0}`);

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: "RESEND_API_KEY not set in environment",
      apiKeyExists: false,
    });
  }

  try {
    const resend = new Resend(apiKey);

    console.log("[Test Email] Sending test email to saar@digitailors.co.il...");

    const result = await resend.emails.send({
      from: "Mr.digitailor <noreply@mr-digitailor.co.il>",
      to: "saar@digitailors.co.il",
      subject: "בדיקת מייל מהמערכת — Mr.digitailor",
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;padding:20px;">
          <h2 style="color:#000;">בדיקת מייל</h2>
          <p>אם אתה רואה את זה, Resend עובד!</p>
          <p style="color:#666;font-size:12px;">נשלח ב: ${new Date().toLocaleString("he-IL")}</p>
        </div>
      `,
    });

    console.log("[Test Email] Resend response:", JSON.stringify(result, null, 2));

    if (result.error) {
      console.error("[Test Email] ERROR:", result.error);
      return NextResponse.json({
        success: false,
        error: result.error,
        apiKeyExists: true,
        apiKeyPrefix: apiKey.substring(0, 10),
      });
    }

    console.log("[Test Email] SUCCESS! ID:", result.data?.id);
    return NextResponse.json({
      success: true,
      emailId: result.data?.id,
      apiKeyExists: true,
      apiKeyPrefix: apiKey.substring(0, 10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Test Email] EXCEPTION:", msg);
    return NextResponse.json({
      success: false,
      error: msg,
      apiKeyExists: true,
      apiKeyPrefix: apiKey.substring(0, 10),
    });
  }
}
