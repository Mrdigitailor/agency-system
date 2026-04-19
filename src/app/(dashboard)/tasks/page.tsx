"use client";

import { useState, useMemo } from "react";
import { Plus, Calendar, Filter, Clock, Loader2, CheckCircle2, AlertOctagon, Send, Pencil, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import Modal from "@/components/ui/Modal";
import { useApp } from "@/lib/data/context";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PLATFORMS, PRIORITIES, TASK_STATUSES, TASK_TYPES, type Task } from "@/lib/data/types";

function getPriorityInfo(priority: string) {
  return PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[1];
}
function getTaskStatusInfo(status: string) {
  return TASK_STATUSES.find((s) => s.value === status) ?? TASK_STATUSES[0];
}
function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function isOverdue(task: Task) {
  return task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();
}

export default function TasksPage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "admin";
  const userId = (session?.user as { id?: string })?.id ?? "";
  const userName = (session?.user as { name?: string })?.name ?? "";
  const { tasks: allTasks, addTask, updateTask, addTaskNote, refreshTasks, clients, employees, settings } = useApp();

  // מנהל קמפיינים רואה רק משימות שלו
  const tasks = role === "campaignManager" ? allTasks.filter((t) => t.assignee === userName) : allTasks;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [noteText, setNoteText] = useState("");

  const [form, setForm] = useState({
    title: "", description: "", clientId: "", assignee: employees[0]?.name ?? "",
    priority: "medium" as Task["priority"], dueDate: "", status: "pending" as Task["status"],
    taskType: "other" as Task["taskType"], platform: "",
  });

  const [editForm, setEditForm] = useState({
    description: "", priority: "medium" as Task["priority"], dueDate: "",
    status: "pending" as Task["status"], assignee: "", clientId: "",
  });

  // === הרשאות ===
  function canEditTask(task: Task): boolean {
    if (role === "admin") return true;
    if (role === "manager") return true; // manager רואה רק לקוחות שלו anyway
    if (role === "campaignManager") return task.assignee === userName;
    return false;
  }
  const isAdmin = role === "admin";

  // KPI
  const kpi = useMemo(() => {
    const pending = tasks.filter((t) => t.status === "pending" && !isOverdue(t)).length;
    const inProgress = tasks.filter((t) => t.status === "in_progress" && !isOverdue(t)).length;
    const done = tasks.filter((t) => t.status === "done").length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    return { pending, inProgress, done, overdue };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus === "overdue") return isOverdue(t);
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterAssignee !== "all" && t.assignee !== filterAssignee) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterAssignee]);

  const getClientName = (clientId: string) => clients.find((c) => c.id === clientId)?.name ?? "—";

  const resetForm = () => {
    setForm({ title: "", description: "", clientId: "", assignee: employees[0]?.name ?? "", priority: "medium", dueDate: "", status: "pending", taskType: "other", platform: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    addTask(form);
    resetForm();
    setIsModalOpen(false);
  };

  const handleAddNote = () => {
    if (!selectedTask || !noteText.trim()) return;
    addTaskNote(selectedTask.id, { author: settings.userName, content: noteText });
    setNoteText("");
  };

  // === מחיקת משימה ===
  async function handleDeleteTask(taskId: string) {
    if (!confirm(t('delete') + '?')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    await refreshTasks();
    setSelectedTask(null);
    setEditingTask(null);
  }

  // === שינוי סטטוס מהיר ===
  async function handleQuickStatus(taskId: string, newStatus: string, e: React.MouseEvent) {
    e.stopPropagation();
    await updateTask(taskId, { status: newStatus } as Partial<Task>);
  }

  // === פתיחת עריכה ===
  function openEdit(task: Task) {
    setEditingTask(task);
    setEditForm({
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      status: task.status,
      assignee: task.assignee,
      clientId: task.clientId,
    });
  }

  async function handleSaveEdit() {
    if (!editingTask) return;
    const data: Record<string, unknown> = {
      description: editForm.description,
      priority: editForm.priority,
      dueDate: editForm.dueDate,
      status: editForm.status,
    };
    // רק admin יכול לשנות assignee ו-clientId
    if (isAdmin) {
      data.assignee = editForm.assignee;
      data.clientId = editForm.clientId || null;
    }
    await updateTask(editingTask.id, data as Partial<Task>);
    setEditingTask(null);
  }

  const inputClass = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

  // גרסה עדכנית של המשימה הנבחרת
  const liveTask = selectedTask ? tasks.find((t) => t.id === selectedTask.id) ?? selectedTask : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-dark">{t('tasks')}</h1>
        <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
          <Plus className="h-4 w-4" />
          {t('newTask')}
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button onClick={() => setFilterStatus("pending")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-muted" /><span className="text-sm text-brand-muted">{t('pending')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{kpi.pending}</p>
        </button>
        <button onClick={() => setFilterStatus("in_progress")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 text-brand-info" /><span className="text-sm text-brand-muted">{t('inProgress')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{kpi.inProgress}</p>
        </button>
        <button onClick={() => setFilterStatus("done")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand-success" /><span className="text-sm text-brand-muted">{t('done')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{kpi.done}</p>
        </button>
        <button onClick={() => setFilterStatus("overdue")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><AlertOctagon className="h-4 w-4 text-brand-danger" /><span className="text-sm text-brand-muted">{t('overdue')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-danger">{kpi.overdue}</p>
        </button>
      </div>

      {/* פילטרים */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-brand-muted" />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
          <option value="all">{t('allStatuses')}</option>
          {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          <option value="overdue">{t('overdue')}</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
          <option value="all">{t('allPriorities')}</option>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
          <option value="all">{t('allEmployees')}</option>
          {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
        </select>
        {filterStatus !== "all" && (
          <button onClick={() => { setFilterStatus("all"); setFilterPriority("all"); setFilterAssignee("all"); }} className="rounded-lg border border-brand-border px-3 py-1.5 text-xs text-brand-muted hover:bg-brand-bg">
            {t('clearFilters')}
          </button>
        )}
      </div>

      {/* טבלה */}
      <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/50">
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('taskTitle')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('client')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('assignee')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('type')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('priority')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('dueDate')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('status')}</th>
                <th className="w-10 px-2 py-3"></th>
                <th className="w-10 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-brand-muted">{t('noResults')}</td></tr>
              )}
              {filteredTasks.map((task) => {
                const priorityInfo = getPriorityInfo(task.priority);
                const overdue = isOverdue(task);
                const editable = canEditTask(task);
                return (
                  <tr key={task.id} onClick={() => { setSelectedTask(task); setNoteText(""); }} className={`cursor-pointer border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg/30 ${overdue ? "bg-red-50/50" : ""}`}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {overdue && <AlertOctagon className="h-4 w-4 shrink-0 text-brand-danger" />}
                        <div>
                          <p className="font-medium text-brand-dark">{task.title}</p>
                          {task.description && <p className="mt-0.5 text-xs text-brand-muted line-clamp-1">{task.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-brand-muted">{getClientName(task.clientId)}</td>
                    <td className="px-4 py-4 text-brand-muted">{task.assignee}</td>
                    <td className="px-4 py-4 text-xs text-brand-muted">{task.taskType === "advertising" ? `פרסום — ${task.platform}` : "אחר"}</td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityInfo.bg} ${priorityInfo.color}`}>{priorityInfo.label}</span></td>
                    <td className={`px-4 py-4 text-sm ${overdue ? "text-brand-danger font-medium" : "text-brand-muted"}`}>
                      <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(task.dueDate)}</div>
                      {overdue && <span className="text-[10px] text-brand-danger">{t('overdue')}</span>}
                    </td>
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      {editable ? (
                        <select
                          value={task.status}
                          onChange={(e) => handleQuickStatus(task.id, e.target.value, e as unknown as React.MouseEvent)}
                          className="rounded-lg border border-brand-border bg-brand-bg px-2 py-1 text-xs font-medium text-brand-dark focus:border-brand-gold focus:outline-none"
                        >
                          {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      ) : overdue ? (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-brand-danger">{t('overdue')}</span>
                      ) : (
                        <span className="rounded-full bg-brand-bg px-2.5 py-1 text-xs font-medium text-brand-dark">{getTaskStatusInfo(task.status).label}</span>
                      )}
                    </td>
                    <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                      {editable && (
                        <button
                          onClick={() => openEdit(task)}
                          className="rounded p-1 text-brand-muted transition-colors hover:bg-brand-bg hover:text-brand-dark"
                          title={t('edit')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                      {(canEditTask(task) || isAdmin) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                          className="rounded p-1 text-brand-muted transition-colors hover:bg-red-50 hover:text-brand-danger"
                          title={t('delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* מודל משימה חדשה */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('newTask')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium text-brand-dark">כותרת</label><input type="text" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputClass} placeholder="כותרת המשימה" required /></div>
          <div><label className="mb-1 block text-sm font-medium text-brand-dark">תיאור</label><textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className={inputClass} placeholder="תיאור המשימה..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-sm font-medium text-brand-dark">לקוח</label><select value={form.clientId} onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))} className={inputClass}><option value="">ללא שיוך</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="mb-1 block text-sm font-medium text-brand-dark">אחראי</label><select value={form.assignee} onChange={(e) => setForm((p) => ({ ...p, assignee: e.target.value }))} className={inputClass}>{employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-sm font-medium text-brand-dark">סוג משימה</label><select value={form.taskType} onChange={(e) => setForm((p) => ({ ...p, taskType: e.target.value as Task["taskType"], platform: "" }))} className={inputClass}>{TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            {form.taskType === "advertising" && (
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">פלטפורמה</label><select value={form.platform} onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))} className={inputClass}><option value="">בחר</option>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-sm font-medium text-brand-dark">דחיפות</label><select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Task["priority"] }))} className={inputClass}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label className="mb-1 block text-sm font-medium text-brand-dark">סטטוס</label><select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Task["status"] }))} className={inputClass}>{TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
          </div>
          <div><label className="mb-1 block text-sm font-medium text-brand-dark">תאריך יעד</label><input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} className={inputClass} /></div>
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg">{t('cancel')}</button>
            <button type="submit" className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80">{t('save')}</button>
          </div>
        </form>
      </Modal>

      {/* מודל עריכת משימה */}
      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title={`${t('edit')} ${t('tasks')}`}>
        {editingTask && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-brand-dark">{editingTask.title}</p>
            <div><label className="mb-1 block text-sm font-medium text-brand-dark">תיאור</label><textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} rows={3} className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">דחיפות</label><select value={editForm.priority} onChange={(e) => setEditForm((p) => ({ ...p, priority: e.target.value as Task["priority"] }))} className={inputClass}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">סטטוס</label><select value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as Task["status"] }))} className={inputClass}>{TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            </div>
            <div><label className="mb-1 block text-sm font-medium text-brand-dark">תאריך יעד</label><input type="date" value={editForm.dueDate} onChange={(e) => setEditForm((p) => ({ ...p, dueDate: e.target.value }))} className={inputClass} /></div>
            {/* שדות admin-only */}
            {isAdmin && (
              <div className="grid grid-cols-2 gap-3 border-t border-brand-border pt-3">
                <div><label className="mb-1 block text-sm font-medium text-brand-dark">אחראי</label><select value={editForm.assignee} onChange={(e) => setEditForm((p) => ({ ...p, assignee: e.target.value }))} className={inputClass}>{employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}</select></div>
                <div><label className="mb-1 block text-sm font-medium text-brand-dark">לקוח</label><select value={editForm.clientId} onChange={(e) => setEditForm((p) => ({ ...p, clientId: e.target.value }))} className={inputClass}><option value="">ללא שיוך</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              </div>
            )}
            <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
              <button onClick={() => setEditingTask(null)} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg">{t('cancel')}</button>
              <button onClick={handleSaveEdit} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80">{t('save')}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* מודל פרטי משימה */}
      <Modal isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} title={t('taskDetails')} size="lg">
        {liveTask && (() => {
          const priorityInfo = getPriorityInfo(liveTask.priority);
          const statusInfo = getTaskStatusInfo(liveTask.status);
          const overdue = isOverdue(liveTask);
          return (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-brand-dark">{liveTask.title}</h3>
                  {liveTask.description && <p className="mt-1 text-sm text-brand-muted">{liveTask.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {overdue && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-brand-danger">{t('overdue')}</span>}
                  {canEditTask(liveTask) && (
                    <button onClick={() => { setSelectedTask(null); openEdit(liveTask); }} className="flex items-center gap-1 rounded-lg border border-brand-border px-2.5 py-1 text-xs text-brand-muted hover:bg-brand-bg">
                      <Pencil className="h-3 w-3" />
                      {t('edit')}
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDeleteTask(liveTask.id)} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-brand-danger hover:bg-red-100">
                      <Trash2 className="h-3 w-3" />
                      {t('delete')}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-brand-bg p-3"><p className="text-xs text-brand-muted">{t('client')}</p><p className="text-sm font-medium text-brand-dark">{getClientName(liveTask.clientId)}</p></div>
                <div className="rounded-lg bg-brand-bg p-3"><p className="text-xs text-brand-muted">{t('assignee')}</p><p className="text-sm font-medium text-brand-dark">{liveTask.assignee}</p></div>
                <div className="rounded-lg bg-brand-bg p-3"><p className="text-xs text-brand-muted">{t('priority')}</p><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityInfo.bg} ${priorityInfo.color}`}>{priorityInfo.label}</span></div>
                <div className="rounded-lg bg-brand-bg p-3"><p className="text-xs text-brand-muted">{t('status')}</p><p className="text-sm font-medium text-brand-dark">{overdue ? t('overdue') : statusInfo.label}</p></div>
                <div className="rounded-lg bg-brand-bg p-3"><p className="text-xs text-brand-muted">{t('dueDate')}</p><p className={`text-sm font-medium ${overdue ? "text-brand-danger" : "text-brand-dark"}`}>{formatDate(liveTask.dueDate)}</p></div>
                <div className="rounded-lg bg-brand-bg p-3"><p className="text-xs text-brand-muted">{t('type')}</p><p className="text-sm font-medium text-brand-dark">{liveTask.taskType === "advertising" ? `פרסום — ${liveTask.platform}` : "אחר"}</p></div>
              </div>

              <div className="border-t border-brand-border pt-4">
                <h4 className="mb-3 text-sm font-semibold text-brand-dark">{t('notesAndChat')}</h4>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {liveTask.notes.length === 0 && <p className="text-sm text-brand-muted">{t('noNotes')}</p>}
                  {liveTask.notes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-brand-bg p-3">
                      <div className="flex items-center justify-between"><span className="text-xs font-medium text-brand-dark">{note.author}</span><span className="text-xs text-brand-muted">{formatDate(note.createdAt)}</span></div>
                      <p className="mt-1 text-sm text-brand-dark">{note.content}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddNote(); } }} className={`${inputClass} flex-1`} placeholder={t('writeNote')} />
                  <button type="button" onClick={handleAddNote} className="rounded-lg bg-brand-gold p-2 text-brand-dark hover:bg-brand-gold/80"><Send className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
