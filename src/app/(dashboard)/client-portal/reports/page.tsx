"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

const cardClass =
  "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

const buttonClass =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";

type ReportFilter = "all" | "שבועי" | "חודשי";

const reports = [
  { id: "r1", type: "שבועי" as const, date: "2026-04-01", period: "24-31 מרץ" },
  { id: "r2", type: "חודשי" as const, date: "2026-03-15", period: "פברואר 2026" },
  { id: "r3", type: "שבועי" as const, date: "2026-03-25", period: "17-24 מרץ" },
  { id: "r4", type: "שבועי" as const, date: "2026-03-18", period: "10-17 מרץ" },
  { id: "r5", type: "חודשי" as const, date: "2026-02-15", period: "ינואר 2026" },
];

const filterTabs: { value: ReportFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "שבועי", label: "שבועי" },
  { value: "חודשי", label: "חודשי" },
];

export default function ClientPortalReportsPage() {
  const [filter, setFilter] = useState<ReportFilter>("all");

  const filteredReports =
    filter === "all" ? reports : reports.filter((r) => r.type === filter);

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <FileText className="h-6 w-6 text-brand-gold" />
        <h1 className="text-2xl font-bold text-brand-dark">דוחות</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              filter === tab.value
                ? "bg-brand-gold text-brand-dark"
                : "border border-brand-border bg-brand-light text-brand-muted hover:bg-brand-bg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Reports table */}
      <div className={cardClass}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border text-brand-muted">
                <th className="pb-3 text-right font-medium">תאריך</th>
                <th className="pb-3 text-right font-medium">סוג</th>
                <th className="pb-3 text-right font-medium">תקופה</th>
                <th className="pb-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filteredReports.map((report) => (
                <tr key={report.id} className="hover:bg-brand-bg/50">
                  <td className="py-3 text-brand-dark">{report.date}</td>
                  <td className="py-3">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                        report.type === "שבועי"
                          ? "bg-brand-info/10 text-brand-info"
                          : "bg-brand-gold/20 text-brand-dark"
                      }`}
                    >
                      {report.type}
                    </span>
                  </td>
                  <td className="py-3 text-brand-dark">{report.period}</td>
                  <td className="py-3">
                    <button className={buttonClass}>צפה בדוח</button>
                  </td>
                </tr>
              ))}
              {filteredReports.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-brand-muted"
                  >
                    אין דוחות להצגה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
