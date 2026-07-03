"use client";

// טאב הדוח השבועי — מבנה נקי: כרטיס הדוח של השבוע (הכל בו) + היסטוריה מקופלת.

import { useState, useEffect, useCallback } from "react";
import { Eye, Pencil, FileText, ChevronDown } from "lucide-react";
import Modal from "@/components/ui/Modal";
import WeeklyReportDraft, { type SentInfo } from "@/components/ui/WeeklyReportDraft";

interface WeeklyReport {
  id: string;
  clientId: string;
  campaignManagerId: string;
  campaignManagerName: string;
  weekStart: string;
  weekEnd: string;
  content: string;
  sentAt: string;
  createdAt: string;
}

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

function formatDateHe(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatWeekPeriod(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart);
  const e = new Date(weekEnd);
  const fmtShort = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  const fmtFull = (d: Date) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${fmtShort(s)}-${fmtFull(e)}`;
}

/** חישוב השבוע האחרון שהסתיים (ראשון-שבת) */
function getLastWeekRange(): { start: Date; end: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const daysBack = day === 6 ? 7 : day + 1;
  const lastSaturday = new Date(today);
  lastSaturday.setDate(today.getDate() - daysBack);
  const lastSunday = new Date(lastSaturday);
  lastSunday.setDate(lastSaturday.getDate() - 6);
  return { start: lastSunday, end: lastSaturday };
}

export default function ClientWeeklyReportsTab({ clientId }: { clientId: string }) {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewReport, setViewReport] = useState<WeeklyReport | null>(null);
  const [editReport, setEditReport] = useState<WeeklyReport | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadReports = useCallback(() => {
    fetch(`/api/clients/${clientId}/weekly-reports`)
      .then((r) => r.json())
      .then((data: WeeklyReport[]) => {
        setReports(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // השבוע האחרון שחלף — האם כבר נשלח עליו דוח?
  const lastWeek = getLastWeekRange();
  const lastWeekStartStr = lastWeek.start.toISOString().split("T")[0];
  const currentWeekReport = reports.find((r) => r.weekStart === lastWeekStartStr);
  const sentInfo: SentInfo | null = currentWeekReport
    ? { sentAt: currentWeekReport.sentAt, by: currentWeekReport.campaignManagerName }
    : null;

  // היסטוריה — כל מה שלא השבוע הנוכחי
  const historyReports = reports.filter((r) => r.weekStart !== lastWeekStartStr);

  async function saveEdit() {
    if (!editReport || !editText.trim()) return;
    setEditSaving(true);
    await fetch(`/api/clients/${clientId}/weekly-reports`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: editReport.id, content: editText.trim() }),
    });
    setReports((prev) =>
      prev.map((r) => (r.id === editReport.id ? { ...r, content: editText.trim() } : r))
    );
    setEditSaving(false);
    setEditReport(null);
  }

  return (
    <div className="space-y-4">
      {/* כרטיס הדוח של השבוע — סטטוס, פעולות, תוכן וצ'אט תיקון, הכל במקום אחד */}
      <WeeklyReportDraft clientId={clientId} onChanged={loadReports} sentInfo={sentInfo} />

      {/* היסטוריה — מקופלת כברירת מחדל, נפתחת רק כשצריך */}
      <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-right"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-gold" />
            <h3 className="text-sm font-semibold text-brand-dark">דוחות קודמים</h3>
            {!loading && (
              <span className="rounded-full bg-brand-bg px-2 py-0.5 text-xs text-brand-muted">{historyReports.length}</span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-brand-muted transition-transform ${historyOpen ? "rotate-180" : ""}`} />
        </button>

        {historyOpen && (
          <div className="border-t border-brand-border">
            {loading ? (
              <p className="px-6 py-4 text-sm text-brand-muted">טוען...</p>
            ) : historyReports.length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-brand-muted">טרם נשלחו דוחות קודמים</p>
            ) : (
              <ul className="divide-y divide-brand-border">
                {historyReports.map((report) => (
                  <li key={report.id} className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-brand-bg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-dark">{formatWeekPeriod(report.weekStart, report.weekEnd)}</p>
                      <p className="text-xs text-brand-muted">
                        נשלח {formatDateHe(report.sentAt)}{report.campaignManagerName ? ` · ${report.campaignManagerName}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setViewReport(report)}
                        className="flex items-center gap-1.5 rounded-lg border border-brand-border px-2.5 py-1 text-xs font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-light hover:text-brand-dark"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        צפה
                      </button>
                      <button
                        onClick={() => { setEditReport(report); setEditText(report.content); }}
                        className="rounded p-1.5 text-brand-muted transition-colors duration-200 hover:bg-brand-light hover:text-brand-dark"
                        title="ערוך"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* מודל צפייה בדוח */}
      <Modal isOpen={!!viewReport} onClose={() => setViewReport(null)} title={viewReport ? `דוח שבועי — ${formatWeekPeriod(viewReport.weekStart, viewReport.weekEnd)}` : ""} size="lg">
        {viewReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-brand-bg p-3">
                <p className="text-xs text-brand-muted">תקופת דיווח</p>
                <p className="text-sm font-medium text-brand-dark">{formatWeekPeriod(viewReport.weekStart, viewReport.weekEnd)}</p>
              </div>
              <div className="rounded-lg bg-brand-bg p-3">
                <p className="text-xs text-brand-muted">תאריך שליחה</p>
                <p className="text-sm font-medium text-brand-dark">{formatDateHe(viewReport.sentAt)}</p>
              </div>
              <div className="rounded-lg bg-brand-bg p-3">
                <p className="text-xs text-brand-muted">נשלח על ידי</p>
                <p className="text-sm font-medium text-brand-dark">{viewReport.campaignManagerName || "—"}</p>
              </div>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-dark">{viewReport.content || "אין תוכן"}</p>
            </div>
            <div className="flex gap-3 border-t border-brand-border pt-4">
              <button
                onClick={() => navigator.clipboard.writeText(viewReport.content)}
                className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg"
              >
                העתק
              </button>
              <button
                onClick={() => { setViewReport(null); setEditReport(viewReport); setEditText(viewReport.content); }}
                className="flex items-center gap-2 rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg"
              >
                <Pencil className="h-4 w-4" />
                ערוך
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* מודל עריכת דוח */}
      <Modal isOpen={!!editReport} onClose={() => setEditReport(null)} title={editReport ? `עריכת דוח — ${formatWeekPeriod(editReport.weekStart, editReport.weekEnd)}` : ""} size="lg">
        {editReport && (
          <div className="space-y-4">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={8}
              className={inputClass}
              dir="rtl"
            />
            <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
              <button onClick={() => setEditReport(null)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">
                ביטול
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editText.trim()}
                className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
              >
                {editSaving ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
