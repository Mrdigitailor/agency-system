// חיבור משפך דוח הפוטנציאל ל-CRM — כל מתעניין שהשאיר פרטים הופך לליד אמיתי,
// כדי שמנוע הפולואפ הקיים של ה-CRM יתפוס אותו כמו כל ליד אחר.
import { prisma } from "@/lib/db/prisma";

const APP_BASE = process.env.APP_BASE_URL ?? "https://agency.mr-digitailor.co.il";

export async function upsertProspectLead(reportId: string): Promise<void> {
  const r = await prisma.potentialReport.findUnique({ where: { id: reportId } });
  if (!r || (!r.contactEmail && !r.contactPhone)) return;
  if (r.leadId) return; // כבר מחובר

  // מניעת כפילות: ליד קיים עם אותו אימייל
  const existing = r.contactEmail
    ? await prisma.lead.findFirst({ where: { email: r.contactEmail } })
    : null;

  if (existing) {
    await prisma.potentialReport.update({ where: { id: r.id }, data: { leadId: existing.id } });
    return;
  }

  const lead = await prisma.lead.create({
    data: {
      name: r.contactName || r.businessName || r.serviceField,
      email: r.contactEmail,
      phone: r.contactPhone,
      company: r.businessName,
      serviceType: r.serviceField,
      estimatedBudget: r.budget ? `${Math.round(r.budget).toLocaleString("he-IL")} ₪/חודש` : "",
      source: "דוח פוטנציאל (צ'אט)",
      status: "new",
      stage: "לידים נכנסים",
      notes: `נכנס דרך משפך דוח הפוטנציאל.\nדוח: ${APP_BASE}/report/${r.token}\nתחום: ${r.serviceField}${r.serviceArea ? ` · אזור: ${r.serviceArea}` : ""}`,
      nextActionType: "call",
      nextActionNote: "ליד חם מהמשפך: עבר שאלון, קיבל דוח פוטנציאל",
    },
  });
  await prisma.potentialReport.update({ where: { id: r.id }, data: { leadId: lead.id } });
  console.log(`[ProspectCRM] lead created for ${r.contactEmail || r.contactPhone}`);
}
