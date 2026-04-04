"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Users, Wallet, ListTodo, AlertTriangle, AlertOctagon, Clock, MoreHorizontal, Zap } from "lucide-react";
import { useApp } from "@/lib/data/context";
import { CLIENT_STATUSES, PRIORITIES } from "@/lib/data/types";
import { getCampaignManagerForClient } from "@/lib/utils/resolveManagers";
import ProgressBar from "@/components/ui/ProgressBar";

function getStatusInfo(status: string) {
  return CLIENT_STATUSES.find((s) => s.value === status) ?? CLIENT_STATUSES[0];
}
function getPriorityInfo(priority: string) {
  return PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[1];
}
function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function isOverdue(t: { status: string; dueDate: string }) {
  return t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date();
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { clients, tasks, alerts, employees } = useApp();

  const role = session?.user?.role ?? "admin";
  const userName = session?.user?.name ?? "";

  // סינון לפי תפקיד — שיוך מנהלים מטבלת העובדים
  const myClientIds = new Set(
    employees
      .filter((e) => e.name === userName)
      .flatMap((e) => e.assignedClientIds)
  );
  const myClients = role === "campaignManager"
    ? clients.filter((c) => myClientIds.has(c.id))
    : clients;
  const myTasks = role === "campaignManager"
    ? tasks.filter((t) => t.assignee === userName)
    : tasks;

  // KPI
  const totalBudget = myClients.reduce((sum, c) => sum + c.monthlyBudget, 0);
  const openTasks = myTasks.filter((t) => t.status !== "done").length;
  const overdueTasks = myTasks.filter((t) => isOverdue(t)).length;
  const urgentTasks = myTasks.filter((t) => t.priority === "urgent" && t.status !== "done");
  const atRiskClients = myClients.filter((c) => c.status === "at_risk").length;
  const unreadAlerts = alerts.filter((a) => !a.isRead).length;

  // 5 משימות דחופות
  const topUrgent = myTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      if (isOverdue(a) && !isOverdue(b)) return -1;
      if (!isOverdue(a) && isOverdue(b)) return 1;
      const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
    })
    .slice(0, 5);

  const isCampaignManager = role === "campaignManager";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-dark">
          {isCampaignManager ? `שלום ${userName}` : "דשבורד"}
        </h1>
        {isCampaignManager && (
          <p className="mt-1 text-sm text-brand-muted">הנה סיכום הפעילות שלך</p>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-brand-muted">
              {isCampaignManager ? "הלקוחות שלי" : "סה״כ לקוחות"}
            </p>
            <Users className="h-5 w-5 text-brand-muted" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-brand-dark">{myClients.length}</p>
          <p className="mt-1 text-sm text-brand-muted">
            {myClients.filter((c) => c.status === "active").length} פעילים
          </p>
        </div>

        <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-brand-muted">משימות פתוחות</p>
            <ListTodo className="h-5 w-5 text-brand-muted" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-brand-dark">{openTasks}</p>
          <p className="mt-1 text-sm text-brand-muted">
            {urgentTasks.length > 0 ? `${urgentTasks.length} דחופות` : "ללא דחופות"}
          </p>
        </div>

        <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-brand-muted">באיחור</p>
            <AlertOctagon className="h-5 w-5 text-brand-danger" />
          </div>
          <p className="mt-2 text-3xl font-semibold text-brand-danger">{overdueTasks}</p>
          <p className="mt-1 text-sm text-brand-muted">דורשות טיפול</p>
        </div>

        {isCampaignManager ? (
          <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-brand-muted">תקציב כולל</p>
              <Wallet className="h-5 w-5 text-brand-muted" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-brand-dark">₪ {totalBudget.toLocaleString()}</p>
            <p className="mt-1 text-sm text-brand-muted">של הלקוחות שלי</p>
          </div>
        ) : (
          <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-brand-muted">
                {role === "admin" ? "התראות" : "לקוחות בסיכון"}
              </p>
              <AlertTriangle className="h-5 w-5 text-brand-muted" />
            </div>
            <p className="mt-2 text-3xl font-semibold text-brand-dark">
              {role === "admin" ? unreadAlerts : atRiskClients}
            </p>
            <p className="mt-1 text-sm text-brand-muted">
              {role === "admin" ? "לא נקראו" : "דורשים תשומת לב"}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* משימות דחופות */}
        <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
            <h2 className="text-lg font-semibold text-brand-dark">משימות דחופות</h2>
            <button onClick={() => router.push("/tasks")} className="text-sm font-medium text-brand-gold hover:text-brand-gold/70">
              הצג הכל
            </button>
          </div>
          <div className="divide-y divide-brand-border">
            {topUrgent.length === 0 && (
              <div className="px-6 py-8 text-center text-brand-muted">אין משימות דחופות</div>
            )}
            {topUrgent.map((task) => {
              const priorityInfo = getPriorityInfo(task.priority);
              const overdue = isOverdue(task);
              const clientName = myClients.find((c) => c.id === task.clientId)?.name ?? "";
              return (
                <div key={task.id} className={`px-6 py-3 ${overdue ? "bg-red-50/50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-brand-dark">{task.title}</p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-brand-muted">
                        {clientName && <span>{clientName}</span>}
                        <span>יעד: {formatDate(task.dueDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-brand-danger">באיחור</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityInfo.bg} ${priorityInfo.color}`}>{priorityInfo.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* טבלת לקוחות */}
        <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
            <h2 className="text-lg font-semibold text-brand-dark">
              {isCampaignManager ? "הלקוחות שלי" : "לקוחות"}
            </h2>
            <button onClick={() => router.push("/clients")} className="text-sm font-medium text-brand-gold hover:text-brand-gold/70">
              הצג הכל
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50">
                  <th className="px-4 py-2 text-right font-medium text-brand-muted">שם</th>
                  <th className="px-4 py-2 text-right font-medium text-brand-muted">סטטוס</th>
                  <th className="px-4 py-2 text-right font-medium text-brand-muted">תקציב</th>
                  <th className="px-4 py-2 text-right font-medium text-brand-muted">משימות</th>
                </tr>
              </thead>
              <tbody>
                {myClients.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-muted">אין לקוחות</td></tr>
                )}
                {myClients.slice(0, 8).map((client) => {
                  const statusInfo = getStatusInfo(client.status);
                  const clientOpenTasks = myTasks.filter((t) => t.clientId === client.id && t.status !== "done").length;
                  return (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/clients/${client.id}`)}
                      className="cursor-pointer border-b border-brand-border hover:bg-brand-bg/30"
                    >
                      <td className="px-4 py-3 font-medium text-brand-dark">{client.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-bg px-2 py-0.5 text-xs font-medium">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.color}`} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-24">
                          <div className="flex justify-between text-[10px] text-brand-muted">
                            <span>₪{client.performance.budgetUsed.toLocaleString()}</span>
                            <span>₪{client.monthlyBudget.toLocaleString()}</span>
                          </div>
                          <ProgressBar current={client.performance.budgetUsed} target={client.monthlyBudget} inverted />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {clientOpenTasks > 0 ? (
                          <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-xs font-medium text-brand-dark">{clientOpenTasks}</span>
                        ) : (
                          <span className="text-xs text-brand-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* התראות — רק לאדמין ומנהל */}
      {(role === "admin" || role === "manager") && alerts.length > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-brand-dark">התראות אחרונות</h2>
          <div className="space-y-2">
            {alerts.filter((a) => !a.isRead).slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between rounded-lg bg-red-50 p-3">
                <div>
                  <p className="text-sm font-medium text-brand-danger">{alert.title}</p>
                  <p className="text-xs text-brand-muted">{formatDate(alert.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
