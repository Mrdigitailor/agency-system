"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useApp } from "@/lib/data/context";
import { getCampaignManagerForClient } from "@/lib/utils/resolveManagers";
import { FileText, CheckCircle2, AlertTriangle, Filter } from "lucide-react";

// ==================== טיפוסים ====================

interface ReportTracker {
  clientId: string;
  weeklyLastSent: string;
  monthlyLastSent: string;
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
  const d = new Date(dateStr);
  return d.toLocaleDateString("he-IL");
}

function getWeeklyPeriod(dateStr: string): string {
  if (!dateStr) return "\u2014";
  const end = new Date(dateStr);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return `${start.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}-${end.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}

function getMonthlyPeriod(dateStr: string): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return prevMonth.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

// ==================== קומפוננטה ראשית ====================

export default function ReportsPage() {
  const { data: session } = useSession();
  const { clients, employees } = useApp();

  const role = (session?.user as { role?: string; name?: string } | undefined)?.role ?? "";
  const userName = (session?.user as { role?: string; name?: string } | undefined)?.name ?? "";

  const canMarkAsSent = role === "manager" || role === "campaignManager";

  const [trackers, setTrackers] = useState<ReportTracker[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "not_sent">("all");
  const [managerFilter, setManagerFilter] = useState("all");

  // אתחול טראקרים מהלקוחות
  useEffect(() => {
    if (clients.length === 0) return;
    setTrackers((prev) => {
      if (prev.length > 0) return prev;
      return clients.map((c, i) => ({
        clientId: c.id,
        weeklyLastSent: i === 0 ? "2026-04-01" : i === 1 ? "2026-03-28" : "",
        monthlyLastSent: i === 0 ? "2026-03-15" : "",
      }));
    });
  }, [clients]);

  // מנהלי קמפיינים
  const campaignManagers = useMemo(
    () => employees.filter((e) => e.role === "campaignManager"),
    [employees],
  );

  // פונקציה שמשלפת מנהל קמפיינים מטבלת עובדים
  const getClientCM = (clientId: string) => getCampaignManagerForClient(clientId, employees);

  // לקוחות מסוננים לפי תפקיד
  const roleFilteredTrackers = useMemo(() => {
    if (role === "campaignManager") {
      // מנהל קמפיינים רואה רק לקוחות שמשויכים אליו בהגדרות
      const myClientIds = new Set(
        employees
          .filter((e) => e.name === userName && e.role === "campaignManager")
          .flatMap((e) => e.assignedClientIds)
      );
      return trackers.filter((t) => myClientIds.has(t.clientId));
    }
    return trackers;
  }, [trackers, employees, role, userName]);

  // KPI חישובים (מבוססים על לקוחות מסוננים לפי תפקיד)
  const kpis = useMemo(() => {
    const weeklySent = roleFilteredTrackers.filter((t) => isWithinLastDays(t.weeklyLastSent, 7)).length;
    const weeklyMissing = roleFilteredTrackers.length - weeklySent;
    const monthlySent = roleFilteredTrackers.filter((t) => isCurrentMonth(t.monthlyLastSent)).length;
    const monthlyMissing = roleFilteredTrackers.length - monthlySent;
    return { weeklySent, weeklyMissing, monthlySent, monthlyMissing };
  }, [roleFilteredTrackers]);

  // התראה על חסרים
  const alertCounts = useMemo(() => {
    const weeklyMissing = roleFilteredTrackers.filter((t) => !isWithinLastDays(t.weeklyLastSent, 7)).length;
    const monthlyMissing = roleFilteredTrackers.filter((t) => {
      if (!t.monthlyLastSent) return true;
      const diff = new Date().getTime() - new Date(t.monthlyLastSent).getTime();
      return diff > 30 * 24 * 60 * 60 * 1000;
    }).length;
    return { weeklyMissing, monthlyMissing };
  }, [roleFilteredTrackers]);

  // סינון טבלה
  const filteredRows = useMemo(() => {
    return roleFilteredTrackers
      .map((tracker) => {
        const client = clients.find((c) => c.id === tracker.clientId);
        if (!client) return null;
        return { tracker, client };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (!row) return false;
        const { tracker, client } = row;

        // סינון מנהל קמפיינים — משליף מטבלת עובדים
        if (managerFilter !== "all" && getClientCM(client.id) !== managerFilter) return false;

        // סינון סטטוס
        if (statusFilter === "sent") {
          return isWithinLastDays(tracker.weeklyLastSent, 7) || isCurrentMonth(tracker.monthlyLastSent);
        }
        if (statusFilter === "not_sent") {
          return !isWithinLastDays(tracker.weeklyLastSent, 7) || !isCurrentMonth(tracker.monthlyLastSent);
        }
        return true;
      });
  }, [roleFilteredTrackers, clients, statusFilter, managerFilter]);

  // סימון כנשלח
  function markWeeklySent(clientId: string) {
    const today = new Date().toISOString().split("T")[0];
    setTrackers((prev) =>
      prev.map((t) => (t.clientId === clientId ? { ...t, weeklyLastSent: today } : t)),
    );
  }

  function markMonthlySent(clientId: string) {
    const today = new Date().toISOString().split("T")[0];
    setTrackers((prev) =>
      prev.map((t) => (t.clientId === clientId ? { ...t, monthlyLastSent: today } : t)),
    );
  }

  // בדיקת אזהרה
  function weeklyWarning(dateStr: string): boolean {
    if (!dateStr) return true;
    return !isWithinLastDays(dateStr, 7);
  }

  function monthlyWarning(dateStr: string): boolean {
    if (!dateStr) return true;
    const diff = new Date().getTime() - new Date(dateStr).getTime();
    return diff > 30 * 24 * 60 * 60 * 1000;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* כותרת */}
      <div className="flex items-center gap-3">
        <FileText className="h-7 w-7 text-brand-gold" />
        <h1 className="text-2xl font-semibold text-brand-dark">מעקב דוחות</h1>
      </div>

      {/* באנר התראה */}
      {(alertCounts.weeklyMissing > 0 || alertCounts.monthlyMissing > 0) && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-700">
            {alertCounts.weeklyMissing > 0 && (
              <span>{alertCounts.weeklyMissing} לקוחות חסרים דוח שבועי</span>
            )}
            {alertCounts.weeklyMissing > 0 && alertCounts.monthlyMissing > 0 && <span>، </span>}
            {alertCounts.monthlyMissing > 0 && (
              <span>{alertCounts.monthlyMissing} חסרים דוח חודשי</span>
            )}
          </p>
        </div>
      )}

      {/* KPI כרטיסים */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="דוחות שבועיים נשלחו השבוע"
          value={kpis.weeklySent}
          color="green"
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
        />
        <KpiCard
          title="דוחות שבועיים חסרים"
          value={kpis.weeklyMissing}
          color="red"
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
        />
        <KpiCard
          title="דוחות חודשיים נשלחו החודש"
          value={kpis.monthlySent}
          color="green"
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
        />
        <KpiCard
          title="דוחות חודשיים חסרים"
          value={kpis.monthlyMissing}
          color="red"
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
        />
      </div>

      {/* פילטרים */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
        <Filter className="h-4 w-4 text-brand-muted" />
        <div className="w-48">
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "sent" | "not_sent")}
          >
            <option value="all">סטטוס: הכל</option>
            <option value="sent">נשלח</option>
            <option value="not_sent">לא נשלח</option>
          </select>
        </div>
        <div className="w-56">
          <select
            className={inputClass}
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
          >
            <option value="all">מנהל קמפיינים: הכל</option>
            {campaignManagers.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* טבלה */}
      <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-light shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-bg text-brand-dark">
              <th className="px-4 py-3 text-right font-medium">שם לקוח</th>
              <th className="px-4 py-3 text-right font-medium">מנהל קמפיינים</th>
              <th className="px-4 py-3 text-right font-medium">דוח שבועי</th>
              <th className="px-4 py-3 text-right font-medium">דוח חודשי</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-brand-muted">
                  אין לקוחות להצגה
                </td>
              </tr>
            ) : (
              filteredRows.map(({ tracker, client }) => {
                const weeklySent = isWithinLastDays(tracker.weeklyLastSent, 7);
                const monthlySent = isCurrentMonth(tracker.monthlyLastSent);

                return (
                  <tr
                    key={client.id}
                    className="border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg"
                  >
                    <td className="px-4 py-3 font-medium text-brand-dark">{client.name}</td>
                    <td className="px-4 py-3 text-brand-muted">{getClientCM(client.id) || "—"}</td>

                    {/* דוח שבועי */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {weeklySent ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                            נשלח
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                            לא נשלח
                          </span>
                        )}
                        {weeklySent && (
                          <span className="text-xs text-brand-muted">{formatDate(tracker.weeklyLastSent)}</span>
                        )}
                        <span className="text-xs text-brand-muted">{getWeeklyPeriod(tracker.weeklyLastSent)}</span>
                        {canMarkAsSent && !weeklySent && (
                          <button
                            onClick={() => markWeeklySent(client.id)}
                            className="rounded-lg border border-brand-border px-2 py-1 text-xs text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                          >
                            סמן כנשלח
                          </button>
                        )}
                        {weeklyWarning(tracker.weeklyLastSent) && (
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                    </td>

                    {/* דוח חודשי */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {monthlySent ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                            נשלח
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                            לא נשלח
                          </span>
                        )}
                        {monthlySent && (
                          <span className="text-xs text-brand-muted">{formatDate(tracker.monthlyLastSent)}</span>
                        )}
                        <span className="text-xs text-brand-muted">{getMonthlyPeriod(tracker.monthlyLastSent)}</span>
                        {canMarkAsSent && !monthlySent && (
                          <button
                            onClick={() => markMonthlySent(client.id)}
                            className="rounded-lg border border-brand-border px-2 py-1 text-xs text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                          >
                            סמן כנשלח
                          </button>
                        )}
                        {monthlyWarning(tracker.monthlyLastSent) && (
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== KPI כרטיס ====================

function KpiCard({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: number;
  color: "green" | "red";
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-muted">{title}</p>
        {icon}
      </div>
      <p
        className={`mt-2 text-3xl font-semibold ${
          color === "green" ? "text-green-600" : "text-red-600"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
