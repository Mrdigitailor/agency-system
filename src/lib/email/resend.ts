import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface WelcomeEmailParams {
  to: string;
  name: string;
  email: string;
  password: string;
  loginUrl: string;
}

export async function sendWelcomeEmail({ to, name, email, password, loginUrl }: WelcomeEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  console.log("=== [Resend] שליחת מייל ברוכים הבאים ===");
  console.log("[Resend] API key:", apiKey ? `${apiKey.substring(0, 10)}...` : "MISSING!");
  console.log("[Resend] From: DigiTailors <noreply@mr-digitailor.co.il>");
  console.log("[Resend] To:", to);
  console.log("[Resend] Subject: ברוכים הבאים למערכת DigiTailors");

  try {
    const result = await resend.emails.send({
      from: "DigiTailors <noreply@mr-digitailor.co.il>",
      to,
      subject: "ברוכים הבאים למערכת DigiTailors",
      html: welcomeTemplate({ name, email, password, loginUrl }),
    });

    console.log("[Resend] Full response:", JSON.stringify(result, null, 2));

    if (result.error) {
      console.error("[Resend] ERROR:", result.error.message ?? JSON.stringify(result.error));
      return { success: false, error: result.error };
    }

    console.log("[Resend] SUCCESS! Email ID:", result.data?.id);
    return { success: true, emailId: result.data?.id };
  } catch (error) {
    console.error("[Resend] EXCEPTION:", error);
    return { success: false, error };
  }
}

interface PasswordResetEmailParams {
  to: string;
  name: string;
  newPassword: string;
  loginUrl: string;
}

export async function sendPasswordResetEmail({ to, name, newPassword, loginUrl }: PasswordResetEmailParams) {
  try {
    console.log("[Resend] Sending password reset email to:", to);

    const { data, error } = await resend.emails.send({
      from: "DigiTailors <noreply@mr-digitailor.co.il>",
      to,
      subject: "הסיסמה שלך עודכנה — DigiTailors",
      html: passwordResetTemplate({ name, newPassword, loginUrl }),
    });

    if (error) {
      console.error("[Resend] Error sending reset email:", JSON.stringify(error));
      return { success: false, error };
    }

    console.log("[Resend] Reset email sent successfully:", data);
    return { success: true };
  } catch (error) {
    console.error("[Resend] Exception sending reset email:", error);
    return { success: false, error };
  }
}

function welcomeTemplate({ name, email, password, loginUrl }: { name: string; email: string; password: string; loginUrl: string }) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background-color:#000000;padding:30px;text-align:center;">
          <h1 style="color:#eed89b;margin:0;font-size:24px;">DigiTailors</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 30px;">
          <h2 style="color:#000000;margin:0 0 20px;">שלום ${name},</h2>
          <p style="color:#666666;font-size:16px;line-height:1.6;margin:0 0 20px;">
            ברוכים הבאים למערכת הניהול של DigiTailors!<br>
            נוצר עבורך חשבון חדש במערכת.
          </p>
          <div style="background-color:#f5f5f5;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="color:#000000;font-size:14px;margin:0 0 8px;"><strong>פרטי התחברות:</strong></p>
            <p style="color:#666666;font-size:14px;margin:0 0 4px;">אימייל: <strong style="color:#000000;">${email}</strong></p>
            <p style="color:#666666;font-size:14px;margin:0;">סיסמה: <strong style="color:#000000;">${password}</strong></p>
          </div>
          <p style="color:#ef4444;font-size:14px;margin:20px 0;">
            ⚠️ מומלץ לשנות את הסיסמה מיד לאחר הכניסה הראשונה.
          </p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${loginUrl}" style="display:inline-block;background-color:#eed89b;color:#000000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              כניסה למערכת
            </a>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#f5f5f5;padding:20px 30px;text-align:center;">
          <p style="color:#999999;font-size:12px;margin:0;">
            © DigiTailors — מערכת ניהול סוכנות
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function passwordResetTemplate({ name, newPassword, loginUrl }: { name: string; newPassword: string; loginUrl: string }) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#000000;padding:30px;text-align:center;">
          <h1 style="color:#eed89b;margin:0;font-size:24px;">DigiTailors</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <h2 style="color:#000000;margin:0 0 20px;">שלום ${name},</h2>
          <p style="color:#666666;font-size:16px;line-height:1.6;margin:0 0 20px;">
            הסיסמה שלך במערכת עודכנה על ידי מנהל המערכת.
          </p>
          <div style="background-color:#f5f5f5;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="color:#000000;font-size:14px;margin:0 0 4px;"><strong>סיסמה חדשה:</strong></p>
            <p style="color:#000000;font-size:18px;margin:0;font-weight:bold;">${newPassword}</p>
          </div>
          <p style="color:#ef4444;font-size:14px;margin:20px 0;">
            ⚠️ מומלץ לשנות את הסיסמה מיד לאחר הכניסה.
          </p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${loginUrl}" style="display:inline-block;background-color:#eed89b;color:#000000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              כניסה למערכת
            </a>
          </div>
        </td></tr>
        <tr><td style="background-color:#f5f5f5;padding:20px 30px;text-align:center;">
          <p style="color:#999999;font-size:12px;margin:0;">© DigiTailors — מערכת ניהול סוכנות</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
