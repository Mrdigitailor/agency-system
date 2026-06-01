"use client";

import { useEffect, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import Modal from "./Modal";
import { useApp } from "@/lib/data/context";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PRIORITIES, TASK_STATUSES, type Task } from "@/lib/data/types";

interface Props {
  taskId: string | null;
  onClose: () => void;
  /** האם להציג בחירת לקוח (true ברשימת משימות כללית; false בכרטיס לקוח) */
  showClientField?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const btnPrimary =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg";
const btnDanger =
  "flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-brand-danger transition-colors duration-200 hover:bg-red-100";

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TaskModal({ taskId, onClose, showClientField = false }: Props) {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const userName = (session?.user as { name?: string })?.name ?? "";
  const isAdmin = role === "admin";

  const { tasks, updateTask, addTaskNote, refreshTasks, clients, employees, settings } = useApp();
  const liveTask = tasks.find((t2) => t2.id === taskId) ?? null;

  const [form, setForm] = useState({
    title: "",
    description: "",
    assignee: "",
    priority: "medium" as Task["priority"],
    dueDate: "",
    status: "pending" as Task["status"],
    clientId: "",
  });
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  // טען את הטופס בכל פעם שמשתנה המשימה הנבחרת
  useEffect(() => {
    if (!liveTask) return;
    setForm({
      title: liveTask.title,
      description: liveTask.description,
      assignee: liveTask.assignee,
      priority: liveTask.priority,
      dueDate: liveTask.dueDate,
      status: liveTask.status,
      clientId: liveTask.clientId,
    });
    setNoteText("");
    // תלוי ב-taskId בלבד — לא רוצים לדרוס שינויי משתמש כשהמשימה מתעדכנת בקונטקסט
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!liveTask) {
    return <Modal isOpen={!!taskId} onClose={onClose} title={t("taskDetails")} size="lg">{null}</Modal>;
  }

  const canEdit = isAdmin || role === "manager" || liveTask.assignee === userName;

  async function handleSave() {
    if (!taskId) return;
    setSaving(true);
    const data: Partial<Task> = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      dueDate: form.dueDate,
      status: form.status,
    };
    // רק אדמין יכול לשנות אחראי ולקוח
    if (isAdmin) {
      data.assignee = form.assignee;
      if (showClientField) {
        // null כדי לנקות שיוך
        (data as Record<string, unknown>).clientId = form.clientId || null;
      }
    }
    await updateTask(taskId, data);
    setSaving(false);
    onClose();
  }

  async function handleAddNote() {
    if (!taskId || !noteText.trim()) return;
    await addTaskNote(taskId, {
      author: session?.user?.name || settings.userName || "אנונימי",
      content: noteText.trim(),
    });
    setNoteText("");
  }

  async function handleDelete() {
    if (!taskId) return;
    if (!confirm(`${t("delete")}?`)) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    await refreshTasks();
    onClose();
  }

  return (
    <Modal isOpen={!!taskId} onClose={onClose} title={liveTask.title || t("taskDetails")} size="lg">
      <div className="space-y-4">
        {/* כותרת */}
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-dark">{t("taskTitle")}</label>
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            disabled={!canEdit}
          />
        </div>

        {/* תיאור */}
        <div>
          <label className="mb-1 block text-sm font-medium text-brand-dark">{t("description")}</label>
          <textarea
            className={inputClass}
            rows={3}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            disabled={!canEdit}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">{t("status")}</label>
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Task["status"] }))}
              disabled={!canEdit}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">{t("priority")}</label>
            <select
              className={inputClass}
              value={form.priority}
              onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Task["priority"] }))}
              disabled={!canEdit}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">{t("dueDate")}</label>
            <input
              type="date"
              className={inputClass}
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">{t("assignee")}</label>
            {isAdmin ? (
              <select
                className={inputClass}
                value={form.assignee}
                onChange={(e) => setForm((p) => ({ ...p, assignee: e.target.value }))}
              >
                <option value="">—</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            ) : (
              <div className={inputClass + " bg-brand-bg/50 text-brand-muted cursor-default"}>
                {liveTask.assignee || "—"}
              </div>
            )}
          </div>
        </div>

        {/* לקוח — מוצג רק במסך משימות הראשי, ורק לאדמין */}
        {showClientField && isAdmin && (
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">{t("client")}</label>
            <select
              className={inputClass}
              value={form.clientId}
              onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
            >
              <option value="">ללא שיוך</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* תגובות */}
        <div className="border-t border-brand-border pt-4">
          <h4 className="mb-3 text-sm font-semibold text-brand-dark">{t("notesAndChat")}</h4>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {liveTask.notes.length === 0 ? (
              <p className="text-sm text-brand-muted">{t("noNotes")}</p>
            ) : (
              liveTask.notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-brand-bg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-brand-dark">{note.author}</span>
                    <span className="text-xs text-brand-muted">{formatDate(note.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-brand-dark">{note.content}</p>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
              className={`${inputClass} flex-1`}
              placeholder={t("writeNote")}
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={!noteText.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              הוסף תגובה
            </button>
          </div>
        </div>

        {/* כפתורי פעולה */}
        <div className="flex items-center justify-between gap-3 border-t border-brand-border pt-4">
          <div>
            {isAdmin && (
              <button type="button" onClick={handleDelete} className={btnDanger}>
                <Trash2 className="h-3.5 w-3.5" />
                מחק משימה
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={btnSecondary}>
              סגור
            </button>
            {canEdit && (
              <button type="button" onClick={handleSave} disabled={saving} className={btnPrimary}>
                {saving ? t("save") + "…" : "שמור שינויים"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
