"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/data/context";
import { Clock, Loader2, CheckCircle2, Calendar } from "lucide-react";
import { PRIORITIES, TASK_STATUSES } from "@/lib/data/types";

function getPriorityInfo(p: string) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];
}
function getStatusInfo(s: string) {
  return TASK_STATUSES.find((x) => x.value === s) ?? TASK_STATUSES[0];
}
function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ClientPortalTasksPage() {
  const { clients, tasks } = useApp();
  const myClient = clients[0]; // דמו — בהמשך ישויך דרך DB

  const clientTasks = useMemo(
    () => (myClient ? tasks.filter((t) => t.clientId === myClient.id) : []),
    [tasks, myClient]
  );

  const pending = clientTasks.filter((t) => t.status === "pending").length;
  const inProgress = clientTasks.filter((t) => t.status === "in_progress").length;
  const done = clientTasks.filter((t) => t.status === "done").length;

  if (!myClient) {
    return <div className="p-6 text-brand-muted">טוען נתונים...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir="rtl">
      <h1 className="text-2xl font-semibold text-brand-dark">משימות</h1>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-muted" />
            <span className="text-sm text-brand-muted">בהמתנה</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{pending}</p>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-brand-info" />
            <span className="text-sm text-brand-muted">בתהליך</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{inProgress}</p>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-success" />
            <span className="text-sm text-brand-muted">הושלמו</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{done}</p>
        </div>
      </div>

      {/* טבלה */}
      <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/50">
                <th className="px-4 py-3 text-right font-medium text-brand-muted">כותרת</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">סטטוס</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">דחיפות</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">תאריך יעד</th>
              </tr>
            </thead>
            <tbody>
              {clientTasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-brand-muted">
                    אין משימות כרגע
                  </td>
                </tr>
              )}
              {clientTasks.map((task) => {
                const priorityInfo = getPriorityInfo(task.priority);
                const statusInfo = getStatusInfo(task.status);
                const isOverdue = task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();
                return (
                  <tr key={task.id} className="border-b border-brand-border">
                    <td className="px-4 py-4">
                      <p className="font-medium text-brand-dark">{task.title}</p>
                      {task.description && (
                        <p className="mt-0.5 text-xs text-brand-muted line-clamp-1">{task.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-brand-bg px-2.5 py-1 text-xs font-medium text-brand-dark">
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityInfo.bg} ${priorityInfo.color}`}>
                        {priorityInfo.label}
                      </span>
                    </td>
                    <td className={`px-4 py-4 ${isOverdue ? "text-brand-danger font-medium" : "text-brand-muted"}`}>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(task.dueDate)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
