// יצירת דוח פוטנציאל — לוגיקה משותפת ל-API הפנימי ולסוכן הצ'אט.
// מקבל קלט מתעניין, מריץ מחקר חי, מחשב שרשרת, שומר ומודיע בטלגרם.
import { prisma } from "@/lib/db/prisma";
import { runResearch } from "./research";
import { computeChain, type Chain } from "./verdict";
import { sendTelegramMessage } from "@/lib/api/telegram/client";
import { ownerChatId } from "@/lib/performance/approval";

export interface CreateReportInput {
  businessName?: string;
  serviceField: string;
  serviceArea?: string;
  budget: number;
  paymentType?: "one_time" | "retainer";
  dealFirst?: number;
  monthlyFee?: number;
  lifetimeMonths?: number;
  closeRate?: number; // אחוז הסגירה שהליד מסר (0 עד 1)
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface CreateReportResult {
  reportId: string;
  token: string;
  status: "ready" | "no_data" | "failed";
  reason?: string;
  chain?: Chain;
  totalVol?: number;
}

export async function createAndRunReport(input: CreateReportInput): Promise<CreateReportResult> {
  const paymentType = input.paymentType === "retainer" ? "retainer" : "one_time";
  const report = await prisma.potentialReport.create({
    data: {
      businessName: (input.businessName ?? "").slice(0, 200),
      serviceField: input.serviceField.slice(0, 200),
      serviceArea: (input.serviceArea ?? "").slice(0, 200),
      budget: input.budget,
      paymentType,
      dealFirst: input.dealFirst ?? 0,
      monthlyFee: paymentType === "retainer" ? (input.monthlyFee ?? 0) : 0,
      lifetimeMonths: Math.min(Math.max(Math.round(input.lifetimeMonths ?? 12) || 12, 1), 120),
      contactName: (input.contactName ?? "").slice(0, 200),
      contactPhone: (input.contactPhone ?? "").slice(0, 50),
      contactEmail: (input.contactEmail ?? "").toLowerCase().slice(0, 200),
    },
  });

  try {
    const research = await runResearch(report.serviceField, report.serviceArea);
    const chain = computeChain(research, {
      budget: report.budget,
      dealFirst: report.dealFirst,
      monthlyFee: report.monthlyFee,
      lifetimeMonths: report.lifetimeMonths,
      closeRate: input.closeRate,
    });
    await prisma.potentialReport.update({
      where: { id: report.id },
      data: {
        status: chain.ok ? "ready" : "no_data",
        error: chain.ok ? "" : (chain.reason ?? ""),
        research: JSON.stringify(research),
        chain: JSON.stringify(chain),
      },
    });

    const chat = ownerChatId();
    if (chat) {
      const who = report.businessName || report.serviceField;
      const link = `${process.env.APP_BASE_URL ?? "https://agency.mr-digitailor.co.il"}/report/${report.token}`;
      const msg = chain.ok
        ? `📊 דוח פוטנציאל מוכן: ${who}\nפוטנציאל: ${Math.round(chain.revenueFirst.head || chain.revenueFull.head).toLocaleString("he-IL")} עד ${Math.round(chain.revenueFirst.best || chain.revenueFull.best).toLocaleString("he-IL")} ₪ בחודש\n${link}`
        : `📊 דוח פוטנציאל: ${who}\nאין מספיק נתונים (${chain.reason}). מומלץ מסלול שיחה.\n${link}`;
      sendTelegramMessage(chat, msg).catch(() => {});
    }

    return {
      reportId: report.id, token: report.token,
      status: chain.ok ? "ready" : "no_data",
      reason: chain.ok ? undefined : chain.reason,
      chain, totalVol: research.totalVol,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "research failed";
    await prisma.potentialReport.update({ where: { id: report.id }, data: { status: "failed", error: msg.slice(0, 500) } });
    return { reportId: report.id, token: report.token, status: "failed", reason: msg };
  }
}
