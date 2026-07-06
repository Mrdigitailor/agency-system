// שליחת מייל שאלון אונבורדינג ללקוח — קישור אישי לטופס הציבורי.
// הדומיין mr-digitailor.co.il מאומת ב-Resend — המייל נשלח ישירות ללקוח.
import { Resend } from "resend";

const FROM = "Mr.digitailor <noreply@mr-digitailor.co.il>";

export interface QuestionnaireEmailResult {
  sent: boolean;
  reason?: string; // מדוע לא נשלח
}

export async function sendQuestionnaireEmail(params: {
  clientName: string;
  contactEmail: string;
  link: string;
}): Promise<QuestionnaireEmailResult> {
  const { clientName, contactEmail, link } = params;
  if (!contactEmail.trim()) return { sent: false, reason: "אין כתובת מייל בכרטיס הלקוח" };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY לא מוגדר בשרת" };

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: contactEmail,
      subject: "ברוכים הבאים ל-Mr.digitailor — שאלון היכרות קצר",
      html: questionnaireEmailTemplate({ clientName, link }),
    });
    if (result.error) {
      console.error("[QuestionnaireEmail] FAILED:", result.error.message ?? JSON.stringify(result.error));
      return { sent: false, reason: result.error.message ?? "שגיאת שליחה" };
    }
    console.log(`[QuestionnaireEmail] SENT to ${contactEmail} (client=${clientName}, id=${result.data?.id})`);
    return { sent: true };
  } catch (err) {
    console.error("[QuestionnaireEmail] EXCEPTION:", err);
    return { sent: false, reason: "שגיאה בשליחת המייל" };
  }
}

function questionnaireEmailTemplate(p: { clientName: string; link: string }) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header with logo -->
        <tr><td style="background-color:#000000;padding:28px 32px;text-align:center;">
          <img src="https://agency.mr-digitailor.co.il/images/logo-mrdigitailors.svg" height="36" alt="Mr.digitailor" style="display:inline-block;" />
        </td></tr>
        <tr><td style="background-color:#eed89b;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 24px;">
          <h2 style="color:#000000;margin:0 0 8px;font-size:20px;font-weight:700;">ברוכים הבאים למשפחת Mr.digitailor! 🎉</h2>
          <p style="color:#666666;font-size:15px;line-height:1.7;margin:0 0 20px;">
            שלום ${p.clientName},<br/>
            אנחנו מתרגשים להתחיל לעבוד יחד. כדי שנוכל לבנות לכם אסטרטגיית פרסום מדויקת,
            נשמח שתמלאו שאלון היכרות קצר — הוא לוקח כ-10 דקות, ואין תשובות נכונות או לא נכונות.
          </p>
          <p style="color:#666666;font-size:14px;line-height:1.7;margin:0 0 28px;">
            💡 אפשר לשמור טיוטה באמצע ולחזור לקישור מתי שנוח — התשובות נשמרות.
          </p>

          <div style="text-align:center;margin:0 0 12px;">
            <a href="${p.link}" style="display:inline-block;background-color:#eed89b;color:#000000;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;">
              למילוי השאלון
            </a>
          </div>
          <p style="color:#999999;font-size:12px;text-align:center;margin:0 0 8px;">
            הקישור אישי עבורכם — אין צורך בסיסמה.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#000000;padding:20px 32px;text-align:center;">
          <p style="color:#eed89b;font-size:12px;margin:0 0 4px;font-weight:600;">Mr.digitailor</p>
          <p style="color:#666666;font-size:11px;margin:0;">סוכנות שיווק ופרסום דיגיטלי</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
