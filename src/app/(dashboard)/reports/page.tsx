"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useApp } from "@/lib/data/context";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatWeekRange, getWeekRangeForDate, getLastWeekRange } from "@/lib/utils/dates";
import { getCampaignManagerForClient } from "@/lib/utils/resolveManagers";
import { FileText, CheckCircle2, AlertTriangle, Filter, Eye, Pencil, Copy, Sparkles, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

// ==================== טיפוסים ====================

interface ReportTracker {
  clientId: string;
  weeklyLastSent: string;
  monthlyLastSent: string;
  weeklyContent: string;
  weeklyAuthor: string;
  monthlyContent: string;
  monthlyAuthor: string;
}

// ==================== עזר ====================

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

function isWithinLastDays(dateStr: string, days: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function isCurrentMonth(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("he-IL");
}

function getWeeklyPeriod(dateStr: string): string {
  if (!dateStr) return "\u2014";
  const { start, end } = getWeekRangeForDate(dateStr);
  return formatWeekRange(start, end);
}

function getMonthlyPeriod(dateStr: string): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return prevMonth.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

// ==================== קומפוננטה ראשית ====================

export default function ReportsPage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const { clients, employees } = useApp();

  const role = (session?.user as { role?: string; name?: string } | undefined)?.role ?? "";
  const userName = (session?.user as { role?: string; name?: string } | undefined)?.name ?? "";

  const canMarkAsSent = role === "admin" || role === "manager" || role === "campaignManager";

  const [trackers, setTrackers] = useState<ReportTracker[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "not_sent">("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [nameFilter, setNameFilter] = useState("");
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // סגירת פופאובר בלחיצה בחוץ
  useEffect(() => {
    if (!openFilter) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("th")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilter]);

  // מודל הזנת תוכן דוח
  const [contentModal, setContentModal] = useState<{ clientId: string; clientName: string; type: "weekly" | "monthly" } | null>(null);
  const [contentText, setContentText] = useState("");
  const [contentSaving, setContentSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // מודל צפייה בדוח
  const [viewModal, setViewModal] = useState<{ clientName: string; type: "weekly" | "monthly"; content: string; author: string; date: string; period: string } | null>(null);

  // מודל עריכה בדיעבד
  const [editModal, setEditModal] = useState<{ clientId: string; clientName: string; type: "weekly" | "monthly"; content: string } | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // טעינת trackers
  useEffect(() => {
    fetch("/api/reports/trackers")
      .then((r) => r.json())
      .then((data: ReportTracker[]) => {
        const map = new Map(data.map((t) => [t.clientId, t]));
        const all = clients.map((c) => map.get(c.id) ?? { clientId: c.id, weeklyLastSent: "", monthlyLastSent: "", weeklyContent: "", weeklyAuthor: "", monthlyContent: "", monthlyAuthor: "" });
        setTrackers(all);
      })
      .catch(() => {});
  }, [clients]);

  const campaignManagers = useMemo(
    () => employees.filter((e) => e.role === "campaignManager"),
    [employees],
  );

  const getClientCM = (clientId: string) => getCampaignManagerForClient(clientId, employees);

  const roleFilteredTrackers = useMemo(() => {
    if (role === "campaignManager") {
      const myClientIds = new Set(
        employees.filter((e) => e.name === userName && e.role === "campaignManager").flatMap((e) => e.assignedClientIds)
      );
      return trackers.filter((t) => myClientIds.has(t.clientId));
    }
    return trackers;
  }, [trackers, employees, role, userName]);

  // תמיד מחושב — השבוע הנוכחי שחלף
  const currentWeekStart = useMemo(() => {
    const { start } = getLastWeekRange();
    return start.toISOString().split("T")[0];
  }, []);

  const kpis = useMemo(() => {
    const weeklySent = roleFilteredTrackers.filter((t) => t.weeklyLastSent >= currentWeekStart).length;
    const weeklyMissing = roleFilteredTrackers.length - weeklySent;
    const monthlySent = roleFilteredTrackers.filter((t) => isCurrentMonth(t.monthlyLastSent)).length;
    const monthlyMissing = roleFilteredTrackers.length - monthlySent;
    return { weeklySent, weeklyMissing, monthlySent, monthlyMissing };
  }, [roleFilteredTrackers, currentWeekStart]);

  const alertCounts = useMemo(() => {
    const weeklyMissing = roleFilteredTrackers.filter((t) => t.weeklyLastSent < currentWeekStart).length;
    const monthlyMissing = roleFilteredTrackers.filter((t) => {
      if (!t.monthlyLastSent) return true;
      return new Date().getTime() - new Date(t.monthlyLastSent).getTime() > 30 * 24 * 60 * 60 * 1000;
    }).length;
    return { weeklyMissing, monthlyMissing };
  }, [roleFilteredTrackers]);

  const filteredRows = useMemo(() => {
    return roleFilteredTrackers
      .map((tracker) => {
        const client = clients.find((c) => c.id === tracker.clientId);
        if (!client) return null;
        return { tracker, client };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (!row) return false;
        const { tracker, client: c } = row;
        if (nameFilter && !c.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
        if (managerFilter !== "all" && getClientCM(c.id) !== managerFilter) return false;
        if (statusFilter === "sent") return tracker.weeklyLastSent >= currentWeekStart || isCurrentMonth(tracker.monthlyLastSent);
        if (statusFilter === "not_sent") return tracker.weeklyLastSent < currentWeekStart || !isCurrentMonth(tracker.monthlyLastSent);
        return true;
      });
  }, [roleFilteredTrackers, clients, statusFilter, managerFilter, nameFilter]);

  // === פתיחת מודל תוכן (במקום סימון ישיר) ===
  function openContentModal(clientId: string, type: "weekly" | "monthly") {
    const client = clients.find((c) => c.id === clientId);
    setContentModal({ clientId, clientName: client?.name ?? "", type });
    setContentText("");
  }

  // === שמירת דוח עם תוכן ===
  async function saveReportContent() {
    if (!contentModal || !contentText.trim()) return;
    setContentSaving(true);
    const today = new Date().toISOString().split("T")[0];
    await fetch("/api/reports/trackers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: contentModal.clientId,
        type: contentModal.type,
        date: today,
        content: contentText.trim(),
        author: userName,
      }),
    });
    // עדכון מקומי
    setTrackers((prev) =>
      prev.map((t) =>
        t.clientId === contentModal.clientId
          ? {
              ...t,
              ...(contentModal.type === "weekly"
                ? { weeklyLastSent: today, weeklyContent: contentText.trim(), weeklyAuthor: userName }
                : { monthlyLastSent: today, monthlyContent: contentText.trim(), monthlyAuthor: userName }),
            }
          : t
      )
    );
    setContentSaving(false);
    setContentModal(null);
  }

  // === יצירת סיכום עם AI ===
  async function generateAiSummary() {
    if (!contentModal) return;
    setAiLoading(true);
    try {
      const res = await fetch(`/api/clients/${contentModal.clientId}/performance`);
      const perf = await res.json();
      const prompt = `צור סיכום שבועי קצר בעברית עבור לקוח "${contentModal.clientName}". הנתונים: הוצאה ${Math.round(perf.totalSpend ?? 0)} ש"ח, ${Math.round(perf.totalConversions ?? 0)} המרות, עלות להמרה ${Math.round(perf.avgCostPerConv ?? 0)} ש"ח, ${perf.totalClicks ?? 0} קליקים, ${perf.totalImpressions ?? 0} חשיפות. כתוב 3-5 משפטים עם תובנות ומה עשינו השבוע.`;

      const aiRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, clientId: contentModal.clientId }),
      });

      if (aiRes.ok) {
        // SSE stream
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
        setContentText(text.trim());
      }
    } catch (err) {
      console.error("AI summary failed:", err);
    } finally {
      setAiLoading(false);
    }
  }

  // === צפייה בדוח ===
  function openViewModal(tracker: ReportTracker, type: "weekly" | "monthly") {
    const client = clients.find((c) => c.id === tracker.clientId);
    const content = type === "weekly" ? tracker.weeklyContent : tracker.monthlyContent;
    const author = type === "weekly" ? tracker.weeklyAuthor : tracker.monthlyAuthor;
    const date = type === "weekly" ? tracker.weeklyLastSent : tracker.monthlyLastSent;
    const period = type === "weekly" ? getWeeklyPeriod(date) : getMonthlyPeriod(date);
    setViewModal({ clientName: client?.name ?? "", type, content, author, date, period });
  }

  // === עריכה בדיעבד ===
  function openEditModal(tracker: ReportTracker, type: "weekly" | "monthly") {
    const client = clients.find((c) => c.id === tracker.clientId);
    const content = type === "weekly" ? tracker.weeklyContent : tracker.monthlyContent;
    setEditModal({ clientId: tracker.clientId, clientName: client?.name ?? "", type, content });
    setEditText(content);
  }

  async function saveEdit() {
    if (!editModal) return;
    setEditSaving(true);
    const tracker = trackers.find((t) => t.clientId === editModal.clientId);
    const date = editModal.type === "weekly" ? tracker?.weeklyLastSent : tracker?.monthlyLastSent;
    await fetch("/api/reports/trackers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: editModal.clientId,
        type: editModal.type,
        date,
        content: editText.trim(),
        author: userName,
      }),
    });
    setTrackers((prev) =>
      prev.map((t) =>
        t.clientId === editModal.clientId
          ? { ...t, ...(editModal.type === "weekly" ? { weeklyContent: editText.trim() } : { monthlyContent: editText.trim() }) }
          : t
      )
    );
    setEditSaving(false);
    setEditModal(null);
  }

  function weeklyWarning(dateStr: string): boolean {
    if (!dateStr) return true;
    return !isWithinLastDays(dateStr, 7);
  }
  function monthlyWarning(dateStr: string): boolean {
    if (!dateStr) return true;
    return new Date().getTime() - new Date(dateStr).getTime() > 30 * 24 * 60 * 60 * 1000;
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <FileText className="h-7 w-7 text-brand-gold" />
        <h1 className="text-2xl font-semibold text-brand-dark">{t('reportTracking')}</h1>
      </div>

      {(alertCounts.weeklyMissing > 0 || alertCounts.monthlyMissing > 0) && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-700">
            {alertCounts.weeklyMissing > 0 && <span>{alertCounts.weeklyMissing} {t('weeklyMissing')}</span>}
            {alertCounts.weeklyMissing > 0 && alertCounts.monthlyMissing > 0 && <span> · </span>}
            {alertCounts.monthlyMissing > 0 && <span>{alertCounts.monthlyMissing} {t('monthlyMissing')}</span>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title={t('weeklySent')} value={kpis.weeklySent} color="green" icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} />
        <KpiCard title={t('weeklyMissing')} value={kpis.weeklyMissing} color="red" icon={<AlertTriangle className="h-5 w-5 text-red-500" />} />
        <KpiCard title={t('monthlySent')} value={kpis.monthlySent} color="green" icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} />
        <KpiCard title={t('monthlyMissing')} value={kpis.monthlyMissing} color="red" icon={<AlertTriangle className="h-5 w-5 text-red-500" />} />
      </div>

      {/* טבלה */}
      <div className="overflow-visible rounded-lg border border-brand-border bg-brand-light shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-bg text-brand-dark">
              {/* שם לקוח — חיפוש */}
              <th className="relative px-4 py-3 text-right font-medium">
                <button onClick={() => setOpenFilter(openFilter === "name" ? null : "name")} className="flex items-center gap-1">
                  {t('name')}
                  <Filter className={`h-3 w-3 ${nameFilter ? "text-brand-gold" : "text-brand-muted"}`} />
                </button>
                {openFilter === "name" && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-brand-border bg-brand-light p-2 shadow-lg">
                    <input
                      type="text"
                      value={nameFilter}
                      onChange={(e) => setNameFilter(e.target.value)}
                      placeholder={`${t('search')}...`}
                      className={inputClass}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Escape") setOpenFilter(null); }}
                    />
                  </div>
                )}
              </th>
              {/* מנהל קמפיינים */}
              <th className="relative px-4 py-3 text-right font-medium">
                <button onClick={() => setOpenFilter(openFilter === "cm" ? null : "cm")} className="flex items-center gap-1">
                  {t('campaignManager')}
                  <Filter className={`h-3 w-3 ${managerFilter !== "all" ? "text-brand-gold" : "text-brand-muted"}`} />
                </button>
                {openFilter === "cm" && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-brand-border bg-brand-light p-2 shadow-lg">
                    <select value={managerFilter} onChange={(e) => { setManagerFilter(e.target.value); setOpenFilter(null); }} className={inputClass} autoFocus>
                      <option value="all">{t('all')}</option>
                      {campaignManagers.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                )}
              </th>
              {/* דוח שבועי */}
              <th className="relative px-4 py-3 text-right font-medium">
                <button onClick={() => setOpenFilter(openFilter === "weekly" ? null : "weekly")} className="flex items-center gap-1">
                  {t('weeklyReport')}
                  <Filter className={`h-3 w-3 ${statusFilter !== "all" ? "text-brand-gold" : "text-brand-muted"}`} />
                </button>
                {openFilter === "weekly" && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-brand-border bg-brand-light p-2 shadow-lg">
                    <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setOpenFilter(null); }} className={inputClass} autoFocus>
                      <option value="all">{t('all')}</option>
                      <option value="sent">{t('sent')}</option>
                      <option value="not_sent">{t('notSent')}</option>
                    </select>
                  </div>
                )}
              </th>
              <th className="px-4 py-3 text-right font-medium">{t('monthlyReport')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-muted">{t('noResults')}</td></tr>
            ) : (
              filteredRows.map(({ tracker, client }) => {
                // השבוע הנוכחי שחלף — תמיד מוצג
                const currentWeek = getLastWeekRange();
                const currentWeekStartStr = currentWeek.start.toISOString().split("T")[0];
                const currentWeekPeriod = formatWeekRange(currentWeek.start, currentWeek.end);

                // האם דוח שבועי נשלח על השבוע הנוכחי?
                const weeklySent = tracker.weeklyLastSent >= currentWeekStartStr;
                const monthlySent = isCurrentMonth(tracker.monthlyLastSent);
                return (
                  <tr key={client.id} className="border-b border-brand-border transition-colors hover:bg-brand-bg">
                    <td className="px-4 py-3 font-medium text-brand-dark">{client.name}</td>
                    <td className="px-4 py-3 text-brand-muted">{getClientCM(client.id) || "—"}</td>

                    {/* שבועי — תמיד מציג את השבוע הנוכחי שחלף */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {weeklySent ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">{t('sent')}</span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">{t('notSent')}</span>
                        )}
                        <span className="text-xs text-brand-muted">{currentWeekPeriod}</span>
                        {weeklySent && tracker.weeklyContent && (
                          <button onClick={() => openViewModal(tracker, "weekly")} className="rounded p-1 text-brand-muted hover:bg-brand-bg hover:text-brand-dark" title={t('viewReport')}>
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canMarkAsSent && !weeklySent && (
                          <button onClick={() => openContentModal(client.id, "weekly")} className="rounded-lg border border-brand-border px-2 py-1 text-xs text-brand-muted hover:bg-brand-bg hover:text-brand-dark">
                            {t('markAsSent')}
                          </button>
                        )}
                        {!weeklySent && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      </div>
                    </td>

                    {/* חודשי */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {monthlySent ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">{t('sent')}</span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">לא {t('sent')}</span>
                        )}
                        <span className="text-xs text-brand-muted">{getMonthlyPeriod(tracker.monthlyLastSent)}</span>
                        {monthlySent && tracker.monthlyContent && (
                          <button onClick={() => openViewModal(tracker, "monthly")} className="rounded p-1 text-brand-muted hover:bg-brand-bg hover:text-brand-dark" title="צפה בדוח">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canMarkAsSent && !monthlySent && (
                          <button onClick={() => openContentModal(client.id, "monthly")} className="rounded-lg border border-brand-border px-2 py-1 text-xs text-brand-muted hover:bg-brand-bg hover:text-brand-dark">
                            {t('markAsSent')}
                          </button>
                        )}
                        {monthlyWarning(tracker.monthlyLastSent) && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ========== מודל הזנת תוכן דוח ========== */}
      <Modal isOpen={!!contentModal} onClose={() => setContentModal(null)} title={`${t('enterSummary')} ${contentModal?.type === "weekly" ? t('weeklyReportLabel') : t('monthlyReportLabel')} — ${contentModal?.clientName ?? ""}`} size="lg">
        {contentModal && (
          <div className="space-y-4">
            <p className="text-sm text-brand-muted">הזן את הסיכום ש{t('sent')} ללקוח. לא ניתן לסמן כ{t('sent')} ללא תוכן.</p>
            <textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              rows={8}
              className={inputClass}
              placeholder={t('pasteHere')}
              dir="rtl"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border pt-4">
              <button
                onClick={generateAiSummary}
                disabled={aiLoading}
                className="flex items-center gap-2 rounded-lg border border-brand-gold bg-brand-gold/10 px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/20 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-brand-gold" />}
                {aiLoading ? t('loading') : t('generateWithAi')}
              </button>
              <div className="flex gap-3">
                <button onClick={() => setContentModal(null)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">
                  {t('cancel')}
                </button>
                <button
                  onClick={saveReportContent}
                  disabled={!contentText.trim() || contentSaving}
                  className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
                >
                  {contentSaving ? t('loading') : t('saveAndMark')}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ========== מודל צפייה בדוח ========== */}
      <Modal isOpen={!!viewModal} onClose={() => setViewModal(null)} title={`${viewModal?.type === "weekly" ? t('weeklyReportLabel') : t('monthlyReportLabel')} — ${viewModal?.clientName ?? ""}`} size="lg">
        {viewModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-brand-bg p-3">
                <p className="text-xs text-brand-muted">תקופת דיווח</p>
                <p className="text-sm font-medium text-brand-dark">{viewModal.period}</p>
              </div>
              <div className="rounded-lg bg-brand-bg p-3">
                <p className="text-xs text-brand-muted">תאריך שליחה</p>
                <p className="text-sm font-medium text-brand-dark">{formatDate(viewModal.date)}</p>
              </div>
              <div className="rounded-lg bg-brand-bg p-3">
                <p className="text-xs text-brand-muted">{t('sent')} על ידי</p>
                <p className="text-sm font-medium text-brand-dark">{viewModal.author || "—"}</p>
              </div>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-dark">{viewModal.content || "אין תוכן"}</p>
            </div>
            <div className="flex gap-3 border-t border-brand-border pt-4">
              <button
                onClick={() => { navigator.clipboard.writeText(viewModal.content); }}
                className="flex items-center gap-2 rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg"
              >
                <Copy className="h-4 w-4" />
                {t('copy')}
              </button>
              <button
                onClick={() => {
                  const tracker = trackers.find((t) => {
                    const c = clients.find((cl) => cl.name === viewModal.clientName);
                    return c && t.clientId === c.id;
                  });
                  if (tracker) {
                    setViewModal(null);
                    openEditModal(tracker, viewModal.type);
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg"
              >
                <Pencil className="h-4 w-4" />
                {t('edit')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========== מודל עריכה בדיעבד ========== */}
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title={`${t('editReport')} — ${editModal?.clientName ?? ""}`} size="lg">
        {editModal && (
          <div className="space-y-4">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={8}
              className={inputClass}
              dir="rtl"
            />
            <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
              <button onClick={() => setEditModal(null)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">ביטול</button>
              <button onClick={saveEdit} disabled={editSaving} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">
                {editSaving ? t('loading') : t('save')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function KpiCard({ title, value, color, icon }: { title: string; value: number; color: "green" | "red"; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-muted">{title}</p>
        {icon}
      </div>
      <p className={`mt-2 text-3xl font-semibold ${color === "green" ? "text-green-600" : "text-red-600"}`}>{value}</p>
    </div>
  );
}
