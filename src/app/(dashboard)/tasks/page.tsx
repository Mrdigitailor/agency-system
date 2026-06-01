"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Calendar, Filter, Clock, Loader2, CheckCircle2, AlertOctagon, Pencil, Trash2, ChevronDown, Search, X } from "lucide-react";
import { useSession } from "next-auth/react";
import Modal from "@/components/ui/Modal";
import TaskModal from "@/components/ui/TaskModal";
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

// ─── Multi-select Filter Dropdown ────────────────────────────────────
type Option = { value: string; label: string };
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const count = selected.length;
  const hasSelection = count > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 focus:outline-none ${
          hasSelection
            ? "border-brand-gold bg-brand-gold/10 text-brand-dark"
            : "border-brand-border bg-brand-light text-brand-dark hover:bg-brand-bg"
        }`}
      >
        <span>{label}</span>
        {hasSelection && (
          <span className="rounded-full bg-brand-gold px-1.5 text-[10px] font-semibold text-brand-dark">{count}</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-brand-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 min-w-[12rem] overflow-y-auto rounded-lg border border-brand-border bg-brand-light shadow-md">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-brand-muted">אין אפשרויות</div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-brand-dark hover:bg-brand-bg"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                    className="accent-brand-gold"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

type Filters = {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  clientIds: string[];
};
const emptyFilters: Filters = { statuses: [], priorities: [], assignees: [], clientIds: [] };

export default function TasksPage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "admin";
  const userName = (session?.user as { name?: string })?.name ?? "";
  const { tasks: allTasks, addTask, updateTask, refreshTasks, clients, employees } = useApp();

  // מנהל קמפיינים רואה רק משימות שלו
  const tasks = role === "campaignManager" ? allTasks.filter((t) => t.assignee === userName) : allTasks;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // ברירת מחדל: רק משימות פתוחות (pending + in_progress) — תואם להתנהגות הקודמת של "open"
  const defaultFilters = useMemo<Filters>(
    () => ({ statuses: ["pending", "in_progress"], priorities: [], assignees: [], clientIds: [] }),
    []
  );
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters);

  const [form, setForm] = useState({
    title: "", description: "", clientId: "", assignee: employees[0]?.name ?? "",
    priority: "medium" as Task["priority"], dueDate: "", status: "pending" as Task["status"],
    taskType: "other" as Task["taskType"], platform: "",
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
    const { statuses, priorities, assignees, clientIds } = appliedFilters;
    return tasks.filter((t) => {
      if (statuses.length > 0) {
        const matches = statuses.some((s) => (s === "overdue" ? isOverdue(t) : t.status === s));
        if (!matches) return false;
      }
      if (priorities.length > 0 && !priorities.includes(t.priority)) return false;
      if (assignees.length > 0 && !assignees.includes(t.assignee)) return false;
      if (clientIds.length > 0 && !clientIds.includes(t.clientId)) return false;
      return true;
    });
  }, [tasks, appliedFilters]);

  // קיצורי דרך מ-KPI: מגדירים סינון מיידי (לא דרך draft)
  const applyStatusShortcut = (status: string) => {
    const next: Filters = { ...emptyFilters, statuses: [status] };
    setDraftFilters(next);
    setAppliedFilters(next);
  };
  const applyFilters = () => setAppliedFilters(draftFilters);
  const clearFilters = () => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  };
  const hasAnyFilter =
    appliedFilters.statuses.length +
      appliedFilters.priorities.length +
      appliedFilters.assignees.length +
      appliedFilters.clientIds.length >
    0;

  // אפשרויות לסינון
  const statusOptions: Option[] = useMemo(
    () => [...TASK_STATUSES.map((s) => ({ value: s.value, label: s.label })), { value: "overdue", label: t("overdue") }],
    [t]
  );
  const priorityOptions: Option[] = useMemo(() => PRIORITIES.map((p) => ({ value: p.value, label: p.label })), []);
  const assigneeOptions: Option[] = useMemo(() => employees.map((e) => ({ value: e.name, label: e.name })), [employees]);
  const clientOptions: Option[] = useMemo(() => clients.map((c) => ({ value: c.id, label: c.name })), [clients]);

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

  // === מחיקת משימה (משמש בכפתור המהיר בטבלה) ===
  async function handleDeleteTask(taskId: string) {
    if (!confirm(t('delete') + '?')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    await refreshTasks();
    setSelectedTaskId(null);
  }

  // === שינוי סטטוס מהיר ===
  async function handleQuickStatus(taskId: string, newStatus: string, e: React.MouseEvent) {
    e.stopPropagation();
    await updateTask(taskId, { status: newStatus } as Partial<Task>);
  }

  const inputClass = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

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
        <button onClick={() => applyStatusShortcut("pending")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-muted" /><span className="text-sm text-brand-muted">{t('pending')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{kpi.pending}</p>
        </button>
        <button onClick={() => applyStatusShortcut("in_progress")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 text-brand-info" /><span className="text-sm text-brand-muted">{t('inProgress')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{kpi.inProgress}</p>
        </button>
        <button onClick={() => applyStatusShortcut("done")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-brand-success" /><span className="text-sm text-brand-muted">{t('done')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">{kpi.done}</p>
        </button>
        <button onClick={() => applyStatusShortcut("overdue")} className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm text-right transition-colors duration-200 hover:bg-brand-bg/50">
          <div className="flex items-center gap-2"><AlertOctagon className="h-4 w-4 text-brand-danger" /><span className="text-sm text-brand-muted">{t('overdue')}</span></div>
          <p className="mt-1 text-2xl font-semibold text-brand-danger">{kpi.overdue}</p>
        </button>
      </div>

      {/* פילטרים — multi-select, מוחל רק בלחיצה על "סנן" */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-brand-muted" />
        <MultiSelectFilter
          label={t('status')}
          options={statusOptions}
          selected={draftFilters.statuses}
          onChange={(statuses) => setDraftFilters((f) => ({ ...f, statuses }))}
        />
        <MultiSelectFilter
          label={t('assignee')}
          options={assigneeOptions}
          selected={draftFilters.assignees}
          onChange={(assignees) => setDraftFilters((f) => ({ ...f, assignees }))}
        />
        <MultiSelectFilter
          label={t('client')}
          options={clientOptions}
          selected={draftFilters.clientIds}
          onChange={(clientIds) => setDraftFilters((f) => ({ ...f, clientIds }))}
        />
        <MultiSelectFilter
          label={t('priority')}
          options={priorityOptions}
          selected={draftFilters.priorities}
          onChange={(priorities) => setDraftFilters((f) => ({ ...f, priorities }))}
        />
        <button
          type="button"
          onClick={applyFilters}
          className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-1.5 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
        >
          <Search className="h-3.5 w-3.5" />
          סנן
        </button>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-sm text-brand-muted transition-colors duration-200 hover:bg-brand-bg"
          >
            <X className="h-3.5 w-3.5" />
            נקה
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
                  <tr key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`cursor-pointer border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg/30 ${overdue ? "bg-red-50/50" : ""}`}>
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
                          onClick={() => setSelectedTaskId(task.id)}
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

      {/* מודל עריכה/צפייה במשימה — קומפוננטה משותפת */}
      <TaskModal taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} showClientField />
    </div>
  );
}
