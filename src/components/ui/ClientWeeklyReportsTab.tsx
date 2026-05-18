"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Eye, Pencil, FileText, CheckCircle2, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

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

const cardClass = "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

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
  const { data: session } = useSession();
  const userName = (session?.user as { name?: string } | undefined)?.name ?? "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canMark = userRole === "admin" || userRole === "manager" || userRole === "campaignManager";

  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewReport, setViewReport] = useState<WeeklyReport | null>(null);
  const [editReport, setEditReport] = useState<WeeklyReport | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // מודל סימון כנשלח
  const [markModal, setMarkModal] = useState(false);
  const [markContent, setMarkContent] = useState("");
  const [markSaving, setMarkSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

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

  // השבוע האחרון שחלף
  const lastWeek = getLastWeekRange();
  const lastWeekStartStr = lastWeek.start.toISOString().split("T")[0];
  const lastWeekEndStr = lastWeek.end.toISOString().split("T")[0];
  const lastWeekPeriod = formatWeekPeriod(lastWeekStartStr, lastWeekEndStr);

  // האם נשלח דוח על השבוע הנוכחי?
  const currentWeekReport = reports.find((r) => r.weekStart === lastWeekStartStr);
  const isCurrentWeekSent = !!currentWeekReport;

  // היסטוריה (ללא השבוע הנוכחי אם קיים)
  const historyReports = reports.filter((r) => r.weekStart !== lastWeekStartStr);

  async function handleMarkAsSent() {
    if (!markContent.trim()) return;
    setMarkSaving(true);
    const today = new Date().toISOString().split("T")[0];
    await fetch("/api/reports/trackers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        type: "weekly",
        date: today,
        content: markContent.trim(),
        author: userName,
      }),
    });
    setMarkSaving(false);
    setMarkModal(false);
    setMarkContent("");
    loadReports();
  }

  async function generateAiSummary() {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/performance`);
      const perf = await res.json();
      const prompt = `צור סיכום שבועי קצר בעברית. הנתונים: הוצאה ${Math.round(perf.totalSpend ?? 0)} ש"ח, ${Math.round(perf.totalConversions ?? 0)} המרות, עלות להמרה ${Math.round(perf.avgCostPerConv ?? 0)} ש"ח. כתוב 3-5 משפטים עם תובנות.`;

      const aiRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, clientId }),
      });

      if (aiRes.ok) {
        const reader = aiRes.body?.getReader();
        const decoder = new TextDecoder();
        let text = "";
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            for (const line of chunk.split("\n")) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") break;
                try { text += JSON.parse(data).text ?? ""; } catch {}
              }
            }
          }
        }
        setMarkContent(text.trim());
      }
    } catch (err) {
      console.error("AI summary failed:", err);
    } finally {
      setAiLoading(false);
    }
  }

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
      {/* שורת סטטוס השבוע הנוכחי */}
      <div className={`${cardClass} border-brand-gold/20 bg-brand-gold/5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isCurrentWeekSent ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
            <div>
              <p className="text-sm font-semibold text-brand-dark">דוח שבועי — {lastWeekPeriod}</p>
              <p className="text-xs text-brand-muted">
                {isCurrentWeekSent
                  ? `נשלח ב-${formatDateHe(currentWeekReport!.sentAt)} על ידי ${currentWeekReport!.campaignManagerName || "—"}`
                  : "טרם נשלח"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isCurrentWeekSent ? (
              <>
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">נשלח</span>
                {currentWeekReport!.content && (
                  <button
                    onClick={() => setViewReport(currentWeekReport!)}
                    className="flex items-center gap-1.5 rounded-lg border border-brand-border px-2.5 py-1 text-xs font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    צפה
                  </button>
                )}
                <button
                  onClick={() => { setEditReport(currentWeekReport!); setEditText(currentWeekReport!.content); }}
                  className="rounded p-1 text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
                  title="ערוך"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">לא נשלח</span>
                {canMark && (
                  <button
                    onClick={() => setMarkModal(true)}
                    className="rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80"
                  >
                    סמן כנשלח
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* היסטוריית דוחות */}
      <div className={cardClass}>
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-brand-gold" />
          <h2 className="text-lg font-semibold text-brand-dark">היסטוריית דוחות שבועיים</h2>
        </div>

        {loading ? (
          <p className="text-sm text-brand-muted">טוען...</p>
        ) : historyReports.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-brand-muted/40" />
            <p className="text-sm text-brand-muted">טרם נשלחו דוחות קודמים</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50">
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">תקופה</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">תאריך שליחה</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">מנהל קמפיינים</th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">תוכן</th>
                </tr>
              </thead>
              <tbody>
                {historyReports.map((report) => (
                  <tr key={report.id} className="border-b border-brand-border transition-colors hover:bg-brand-bg">
                    <td className="px-4 py-3 font-medium text-brand-dark">
                      {formatWeekPeriod(report.weekStart, report.weekEnd)}
                    </td>
                    <td className="px-4 py-3 text-brand-muted">
                      {formatDateHe(report.sentAt)}
                    </td>
                    <td className="px-4 py-3 text-brand-muted">
                      {report.campaignManagerName || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewReport(report)}
                          className="flex items-center gap-1.5 rounded-lg border border-brand-border px-2.5 py-1 text-xs font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          צפה
                        </button>
                        <button
                          onClick={() => { setEditReport(report); setEditText(report.content); }}
                          className="rounded p-1 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                          title="ערוך"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* מודל סימון כנשלח */}
      <Modal isOpen={markModal} onClose={() => setMarkModal(false)} title={`סימון דוח שבועי כנשלח — ${lastWeekPeriod}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">הזן את הסיכום ששלחת ללקוח. לא ניתן לסמן כנשלח ללא תוכן.</p>
          <textarea
            value={markContent}
            onChange={(e) => setMarkContent(e.target.value)}
            rows={8}
            className={inputClass}
            placeholder="הדבק כאן את תוכן הדוח..."
            dir="rtl"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border pt-4">
            <button
              onClick={generateAiSummary}
              disabled={aiLoading}
              className="flex items-center gap-2 rounded-lg border border-brand-gold bg-brand-gold/10 px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/20 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-brand-gold" />}
              {aiLoading ? "יוצר..." : "צור עם AI"}
            </button>
            <div className="flex gap-3">
              <button onClick={() => setMarkModal(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">
                ביטול
              </button>
              <button
                onClick={handleMarkAsSent}
                disabled={!markContent.trim() || markSaving}
                className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
              >
                {markSaving ? "שומר..." : "שמור וסמן כנשלח"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

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
