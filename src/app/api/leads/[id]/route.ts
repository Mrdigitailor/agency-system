import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { defaultNextActionForStatus } from "@/lib/crm/automations";
import { todayIL } from "@/lib/utils/ildate";

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
    const current = await prisma.lead.findUnique({ where: { id }, select: { status: true, nextFollowUp: true } });
    if (current && current.status !== body.status) {
      body.stageChangedAt = todayIL();
      let stageText = `סטטוס: ${STATUS_HE[current.status] ?? current.status} ← ${STATUS_HE[body.status] ?? body.status}`;
      if (body.status === "lost" && body.closeReason) stageText += ` (${body.closeReason})`;
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
