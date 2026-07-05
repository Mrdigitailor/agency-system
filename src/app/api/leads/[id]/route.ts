import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { defaultNextActionForStatus } from "@/lib/crm/automations";
import { todayIL, shiftYmd } from "@/lib/utils/ildate";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";

const STATUS_HE: Record<string, string> = {
  new: "חדש", contacted: "נוצר קשר", meeting_set: "נקבעה פגישה", proposal_sent: "נשלחה הצעה",
  negotiation: "משא ומתן", won: "נסגר", lost: "אבד", churned: "נוטש",
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const user = auth as AuthUser;

  const { id } = await params;
  const body = await req.json();
  if (body.interestedServices) body.interestedServices = JSON.stringify(body.interestedServices);

  // רישום אוטומטי לציר הפעילות (לא מפיל את הבקשה אם נכשל)
  const logActivity = (type: string, text: string) =>
    prisma.leadActivity.create({ data: { leadId: id, type, text, author: user.name ?? "" } }).catch(() => {});

  // אוטומציית מעבר סטטוס: עדכון stageChangedAt + הצעת צעד הבא אם אין
  if (body.status) {
    const current = await prisma.lead.findUnique({ where: { id } });
    if (current && current.status !== body.status) {
      body.stageChangedAt = todayIL();
      const REASON_HE: Record<string, string> = { price: "מחיר", timing: "תזמון", competitor: "מתחרה", not_relevant: "לא רלוונטי", no_budget: "אין תקציב", other: "אחר" };
      let stageText = `סטטוס: ${STATUS_HE[current.status] ?? current.status} ← ${STATUS_HE[body.status] ?? body.status}`;
      if (body.status === "lost" && body.closeReason) stageText += ` (${REASON_HE[body.closeReason] ?? body.closeReason})`;
      await logActivity("stage", stageText);

      // אם לא נשלח צעד הבא בבקשה — נגזר ברירת מחדל לפי הסטטוס החדש
      // (למשל: נשלחה הצעה → פולו-אפ בעוד 48 שעות)
      if (!body.nextFollowUp) {
        const auto = defaultNextActionForStatus(body.status);
        if (auto) {
          body.nextFollowUp = auto.nextFollowUp;
          body.nextActionType = auto.nextActionType;
          body.nextActionNote = auto.nextActionNote;
        } else {
          // סטטוס סגור (נסגר/אבד/נוטש) — מנקים את הצעד הבא
          body.nextFollowUp = "";
          body.nextActionType = "";
          body.nextActionNote = "";
        }
      }

      // ═══ אבד → תזכורת החייאה: "לא עכשיו" הוא ההפסד הכי נפוץ אצל סוכנות ═══
      if (body.status === "lost") {
        const reason = body.closeReason ?? "";
        const months = reason === "timing" ? 3 : ["price", "competitor", "no_budget"].includes(reason) ? 6 : 0;
        if (months > 0) {
          body.nextFollowUp = shiftYmd(todayIL(), months * 30);
          body.nextActionType = "followup";
          body.nextActionNote = `החייאת ליד אבוד (${REASON_HE[reason] ?? reason}) — לבדוק אם התזמון השתנה`;
          await logActivity("system", `⏰ נקבעה תזכורת החייאה בעוד ${months} חודשים`);
        }
      }

      // ═══ נסגר → יצירת לקוח אוטומטית במערכת (אפס הקלדה כפולה) ═══
      if (body.status === "won" && !current.clientId) {
        if (!body.closedAt && !current.closedAt) body.closedAt = todayIL();
        try {
          // מיפוי שירותים → פלטפורמות
          const services = (JSON.parse(current.interestedServices || "[]") as string[]).join(" ");
          const platforms: string[] = [];
          if (/meta|facebook|פייסבוק|אינסטגרם|instagram/i.test(services)) platforms.push("Meta");
          if (/google|גוגל/i.test(services)) platforms.push("Google Ads");
          if (/tiktok|טיקטוק/i.test(services)) platforms.push("TikTok");

          const client = await prisma.client.create({
            data: {
              name: current.company || current.name,
              platforms: JSON.stringify(platforms),
              customAssets: "[]",
              contactEmail: current.email,
              contactPhone: current.phone,
              website: current.website,
              status: "active",
              notes: `נוצר אוטומטית מסגירת ליד ב-CRM (${todayIL()})${current.monthlyValue ? ` · ריטיינר חודשי: ₪${current.monthlyValue.toLocaleString()}` : ""}`,
            },
          });
          body.clientId = client.id;
          await logActivity("system", `🎉 נוצר לקוח חדש במערכת: ${client.name}`);
          const chat = ownerChatId();
          if (chat) {
            sendTelegramMessage(chat, `🎉 עסקה נסגרה! ${current.name}${current.company ? ` (${current.company})` : ""}${(current.dealValue || current.value) ? ` — ₪${(current.dealValue || current.value).toLocaleString()}` : ""}\nנוצר כרטיס לקוח חדש במערכת — נשאר רק לחבר חשבונות פרסום ולשבץ מנהל.`).catch(() => {});
          }
        } catch (e) {
          console.error("[Leads] auto-create client failed:", e);
        }
      }
    }
  }

  // אירועי הצעת מחיר → ציר הפעילות
  if (body.proposalUrl) await logActivity("proposal", `הועלתה הצעת מחיר: ${body.proposalFileName ?? ""}`);
  if (body.proposalStatus === "approved") await logActivity("proposal", `ההצעה אושרה 🎉${body.proposalAmount ? ` (₪${Number(body.proposalAmount).toLocaleString()})` : ""}`);
  if (body.proposalStatus === "rejected") await logActivity("proposal", "ההצעה נדחתה");

  const lead = await prisma.lead.update({
    where: { id },
    data: body,
    include: { calls: true },
  });
  return NextResponse.json({ ...lead, interestedServices: JSON.parse(lead.interestedServices) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  // מחק שיחות קשורות
  await prisma.leadCall.deleteMany({ where: { leadId: id } });
  // מחק את הליד
  await prisma.lead.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
