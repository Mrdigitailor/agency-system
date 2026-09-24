// עמוד הדוח הציבורי — נגיש בקישור שיתוף בלבד (token), בלי התחברות.
import { prisma } from "@/lib/db/prisma";
import { renderReportHtml, renderReportFallback } from "@/lib/prospect/report-html";
import type { ResearchResult } from "@/lib/prospect/research";
import type { Chain } from "@/lib/prospect/verdict";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const html = (body: string, status = 200) =>
    new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=60" } });

  if (!token || !/^[a-z0-9-]{16,40}$/i.test(token)) return html(renderReportFallback("failed"), 404);
  const report = await prisma.potentialReport.findUnique({ where: { token } });
  if (!report) return html(renderReportFallback("failed"), 404);

  if (report.status !== "ready") {
    return html(renderReportFallback(report.status, report.error || undefined));
  }

  try {
    const research = JSON.parse(report.research) as ResearchResult;
    const chain = JSON.parse(report.chain) as Chain;
    return html(renderReportHtml(
      {
        businessName: report.businessName,
        serviceField: report.serviceField,
        serviceArea: report.serviceArea,
        budget: report.budget,
        paymentType: report.paymentType,
        monthlyFee: report.monthlyFee,
        lifetimeMonths: report.lifetimeMonths,
        createdAt: report.createdAt,
      },
      research,
      chain,
    ));
  } catch {
    return html(renderReportFallback("failed"), 500);
  }
}
