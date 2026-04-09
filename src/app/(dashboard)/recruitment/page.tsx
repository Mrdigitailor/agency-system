"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Users } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";

/* ── טיפוסים ── */

interface Recruitment {
  id: string;
  name: string;
  email: string;
  phone: string;
  experience: string;
  notes: string;
  cvUrl: string;
  stage: "submitted" | "task_sent" | "interview" | "accepted" | "rejected";
  position: string;
  createdAt: string;
}

/* ── קבועים ── */

const STAGE_LABELS: Record<Recruitment["stage"], string> = {
  submitted: "התקבלה מועמדות",
  task_sent: "נשלחה משימה",
  interview: "ראיון",
  accepted: "התקבל",
  rejected: "נדחה",
};

const STAGE_COLORS: Record<Recruitment["stage"], string> = {
  submitted: "bg-blue-100 text-blue-800",
  task_sent: "bg-yellow-100 text-yellow-800",
  interview: "bg-purple-100 text-purple-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const KANBAN_COLUMNS: { value: Recruitment["stage"]; label: string }[] = [
  { value: "submitted", label: "התקבלה מועמדות" },
  { value: "task_sent", label: "נשלחה משימה" },
  { value: "interview", label: "ראיון" },
  { value: "accepted", label: "התקבל" },
  { value: "rejected", label: "נדחה" },
];

/* ── סגנונות ── */

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const btnPrimary =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";
const btnSecondary =
  "rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg";
const cardClass =
  "rounded-lg border border-brand-border bg-brand-light shadow-sm";

/* ── Kanban Droppable Column ── */

function KanbanColumn({
  stage,
  label,
  candidates,
  onCardClick,
}: {
  stage: string;
  label: string;
  candidates: Recruitment[];
  onCardClick: (c: Recruitment) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] w-64 shrink-0 flex-col rounded-lg bg-brand-bg p-3 transition-colors duration-200 ${
        isOver ? "ring-2 ring-brand-gold" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-dark">{label}</h3>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-border px-1.5 text-xs font-medium text-brand-dark">
          {candidates.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {candidates.map((c) => (
          <KanbanCard key={c.id} candidate={c} onClick={() => onCardClick(c)} />
        ))}
      </div>
    </div>
  );
}

/* ── Kanban Draggable Card ── */

function KanbanCard({
  candidate,
  onClick,
}: {
  candidate: Recruitment;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: candidate.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`cursor-grab rounded-lg border border-brand-border bg-brand-light p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
    >
      <p className="text-sm font-medium text-brand-dark">{candidate.name}</p>
      {candidate.position && (
        <p className="mt-0.5 text-xs text-brand-muted">{candidate.position}</p>
      )}
      {candidate.email && (
        <p className="mt-0.5 text-xs text-brand-muted">{candidate.email}</p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   דף ניהול גיוסים
   ══════════════════════════════════════════ */

export default function RecruitmentPage() {
  const [candidates, setCandidates] = useState<Recruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Recruitment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [filterPosition, setFilterPosition] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [activeTab, setActiveTab] = useState<"table" | "kanban">("table");

  const emptyForm = {
    name: "",
    email: "",
    phone: "",
    experience: "",
    notes: "",
    cvUrl: "",
    stage: "submitted" as Recruitment["stage"],
    position: "",
  };

  const [form, setForm] = useState(emptyForm);

  /* ── טעינת נתונים ── */

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch("/api/recruitment");
      if (res.ok) {
        const data = await res.json();
        setCandidates(data);
      }
    } catch (err) {
      console.error("שגיאה בטעינת מועמדים:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  /* ── פילטרים ── */

  const uniquePositions = Array.from(
    new Set(candidates.map((c) => c.position).filter(Boolean))
  );

  const filtered = candidates.filter((c) => {
    if (filterPosition !== "all" && c.position !== filterPosition) return false;
    if (filterStage !== "all" && c.stage !== filterStage) return false;
    return true;
  });

  /* ── שמירה (הוספה / עדכון) ── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      if (editingCandidate) {
        const res = await fetch(`/api/recruitment/${editingCandidate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const updated = await res.json();
          setCandidates((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
        }
      } else {
        const res = await fetch("/api/recruitment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const created = await res.json();
          setCandidates((prev) => [created, ...prev]);
        }
      }
      closeModal();
    } catch (err) {
      console.error("שגיאה בשמירת מועמד:", err);
    }
  };

  /* ── מחיקה ── */

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/recruitment/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (err) {
      console.error("שגיאה במחיקת מועמד:", err);
    }
    setDeleteConfirm(null);
  };

  /* ── עזר ── */

  const openAdd = () => {
    setEditingCandidate(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (c: Recruitment) => {
    setEditingCandidate(c);
    setForm({
      name: c.name,
      email: c.email,
      phone: c.phone,
      experience: c.experience,
      notes: c.notes,
      cvUrl: c.cvUrl,
      stage: c.stage,
      position: c.position,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCandidate(null);
    setForm(emptyForm);
  };

  /* ── גרירה בקנבן ── */

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const candidateId = active.id as string;
    const newStage = over.id as Recruitment["stage"];

    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate || candidate.stage === newStage) return;

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, stage: newStage } : c))
    );

    try {
      await fetch(`/api/recruitment/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch (err) {
      console.error("שגיאה בעדכון שלב:", err);
      fetchCandidates();
    }
  };

  /* ── רינדור ── */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-brand-muted">טוען מועמדים...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 p-6">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand-gold" />
          <h1 className="text-2xl font-semibold text-brand-dark">גיוסים</h1>
        </div>
        <button onClick={openAdd} className={btnPrimary + " flex items-center gap-2"}>
          <Plus className="h-4 w-4" />
          הוסף מועמד
        </button>
      </div>

      {/* טאב טבלה / קנבן */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveTab("table")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            activeTab === "table"
              ? "bg-brand-gold text-brand-dark"
              : "bg-brand-bg text-brand-muted hover:bg-brand-border"
          }`}
        >
          טבלה
        </button>
        <button
          onClick={() => setActiveTab("kanban")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
            activeTab === "kanban"
              ? "bg-brand-gold text-brand-dark"
              : "bg-brand-bg text-brand-muted hover:bg-brand-border"
          }`}
        >
          Kanban
        </button>
      </div>

      {/* פילטרים */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterPosition}
          onChange={(e) => setFilterPosition(e.target.value)}
          className={inputClass + " w-auto min-w-[160px]"}
        >
          <option value="all">כל התפקידים</option>
          {uniquePositions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className={inputClass + " w-auto min-w-[160px]"}
        >
          <option value="all">כל השלבים</option>
          {Object.entries(STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* תצוגת טבלה */}
      {activeTab === "table" && (
        <div className={cardClass + " overflow-x-auto"}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border text-right">
                <th className="px-4 py-3 font-medium text-brand-muted">שם</th>
                <th className="px-4 py-3 font-medium text-brand-muted">תפקיד</th>
                <th className="px-4 py-3 font-medium text-brand-muted">שלב</th>
                <th className="px-4 py-3 font-medium text-brand-muted">אימייל</th>
                <th className="px-4 py-3 font-medium text-brand-muted">טלפון</th>
                <th className="px-4 py-3 font-medium text-brand-muted">ניסיון</th>
                <th className="px-4 py-3 font-medium text-brand-muted">קו"ח</th>
                <th className="px-4 py-3 font-medium text-brand-muted">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-brand-muted"
                  >
                    לא נמצאו מועמדים
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg"
                  >
                    <td className="px-4 py-3 font-medium text-brand-dark">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-brand-dark">{c.position}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STAGE_COLORS[c.stage]
                        }`}
                      >
                        {STAGE_LABELS[c.stage]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-dark">{c.email}</td>
                    <td className="px-4 py-3 text-brand-dark">{c.phone}</td>
                    <td className="px-4 py-3 text-brand-dark">{c.experience}</td>
                    <td className="px-4 py-3">
                      {c.cvUrl ? (
                        <a
                          href={c.cvUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-gold hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          צפייה
                        </a>
                      ) : (
                        <span className="text-brand-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                          title="עריכה"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(c.id)}
                          className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
                          title="מחיקה"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* תצוגת קנבן */}
      {activeTab === "kanban" && (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.value}
                stage={col.value}
                label={col.label}
                candidates={filtered.filter((c) => c.stage === col.value)}
                onCardClick={openEdit}
              />
            ))}
          </div>
        </DndContext>
      )}

      {/* מודאל אישור מחיקה */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="אישור מחיקה"
        size="sm"
      >
        <p className="mb-4 text-sm text-brand-dark">
          האם למחוק את המועמד? לא ניתן לבטל פעולה זו.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setDeleteConfirm(null)}
            className={btnSecondary}
          >
            ביטול
          </button>
          <button
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-red-600"
          >
            מחיקה
          </button>
        </div>
      </Modal>

      {/* מודאל הוספה / עריכה */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingCandidate ? "עריכת מועמד" : "הוספת מועמד"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* שם */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                שם
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                placeholder="שם מלא"
                required
              />
            </div>

            {/* אימייל */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                אימייל
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
                placeholder="example@mail.com"
              />
            </div>

            {/* טלפון */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                טלפון
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputClass}
                placeholder="050-0000000"
              />
            </div>

            {/* ניסיון */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                ניסיון
              </label>
              <input
                type="text"
                value={form.experience}
                onChange={(e) =>
                  setForm({ ...form, experience: e.target.value })
                }
                className={inputClass}
                placeholder="שנות ניסיון / תיאור"
              />
            </div>

            {/* תפקיד */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                תפקיד
              </label>
              <input
                type="text"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className={inputClass}
                placeholder="תפקיד מבוקש"
              />
            </div>

            {/* שלב */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                שלב
              </label>
              <select
                value={form.stage}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stage: e.target.value as Recruitment["stage"],
                  })
                }
                className={inputClass}
              >
                {Object.entries(STAGE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* קישור קו"ח */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                קישור קו&quot;ח
              </label>
              <input
                type="url"
                value={form.cvUrl}
                onChange={(e) => setForm({ ...form, cvUrl: e.target.value })}
                className={inputClass}
                placeholder="https://..."
              />
            </div>

            {/* הערות */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                הערות
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputClass + " min-h-[80px] resize-y"}
                placeholder="הערות נוספות..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className={btnSecondary}>
              ביטול
            </button>
            <button type="submit" className={btnPrimary}>
              {editingCandidate ? "עדכון" : "הוספה"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
