"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Search, Users } from "lucide-react";
import Modal from "@/components/ui/Modal";

/* ── טיפוסים ── */

interface Supplier {
  id: string;
  name: string;
  type: string;
  field: string;
  phone: string;
  role: string;
  company: string;
  email: string;
  notes: string;
  createdAt: string;
}

/* ── קבועים ── */

const SUPPLIER_TYPES = ["ספק", "שותף", "פרילנסר"];

const SUPPLIER_FIELDS = [
  "בניית אתרים",
  "עיצוב",
  "צילום",
  "וידאו",
  "קופירייטינג",
  "SEO",
  "אחר",
];

const TYPE_COLORS: Record<string, string> = {
  ספק: "bg-blue-100 text-blue-800",
  שותף: "bg-green-100 text-green-800",
  פרילנסר: "bg-purple-100 text-purple-800",
};

const FIELD_COLORS: Record<string, string> = {
  "בניית אתרים": "bg-indigo-100 text-indigo-800",
  עיצוב: "bg-pink-100 text-pink-800",
  צילום: "bg-amber-100 text-amber-800",
  וידאו: "bg-red-100 text-red-800",
  קופירייטינג: "bg-teal-100 text-teal-800",
  SEO: "bg-cyan-100 text-cyan-800",
  אחר: "bg-gray-100 text-gray-800",
};

/* ── סגנונות ── */

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const btnPrimary =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";
const btnSecondary =
  "rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg";
const cardClass =
  "rounded-lg border border-brand-border bg-brand-light shadow-sm";

/* ══════════════════════════════════════════
   דף ניהול ספקים
   ══════════════════════════════════════════ */

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [filterField, setFilterField] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const emptyForm = {
    name: "",
    type: "ספק",
    field: "בניית אתרים",
    phone: "",
    role: "",
    company: "",
    email: "",
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);

  /* ── טעינת נתונים ── */

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (err) {
      console.error("שגיאה בטעינת ספקים:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  /* ── פילטרים ── */

  const uniqueFields = Array.from(
    new Set(suppliers.map((s) => s.field).filter(Boolean))
  );

  const filtered = suppliers.filter((s) => {
    if (filterField !== "all" && s.field !== filterField) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.includes(q) ||
        s.role.toLowerCase().includes(q)
      );
    }
    return true;
  });

  /* ── שמירה (הוספה / עדכון) ── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      if (editingSupplier) {
        const res = await fetch(`/api/suppliers/${editingSupplier.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const updated = await res.json();
          setSuppliers((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          );
        }
      } else {
        const res = await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          const created = await res.json();
          setSuppliers((prev) => [created, ...prev]);
        }
      }
      closeModal();
    } catch (err) {
      console.error("שגיאה בשמירת ספק:", err);
    }
  };

  /* ── מחיקה ── */

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSuppliers((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error("שגיאה במחיקת ספק:", err);
    }
    setDeleteConfirm(null);
  };

  /* ── עזר ── */

  const openAdd = () => {
    setEditingSupplier(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setForm({
      name: s.name,
      type: s.type,
      field: s.field,
      phone: s.phone,
      role: s.role,
      company: s.company,
      email: s.email,
      notes: s.notes,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
    setForm(emptyForm);
  };

  /* ── רינדור ── */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-brand-muted">טוען ספקים...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 p-6">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand-gold" />
          <h1 className="text-2xl font-semibold text-brand-dark">ספקים</h1>
        </div>
        <button onClick={openAdd} className={btnPrimary + " flex items-center gap-2"}>
          <Plus className="h-4 w-4" />
          הוסף ספק
        </button>
      </div>

      {/* פילטרים */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterField}
          onChange={(e) => setFilterField(e.target.value)}
          className={inputClass + " w-auto min-w-[160px]"}
        >
          <option value="all">כל התחומים</option>
          {uniqueFields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={inputClass + " w-64 pr-9"}
            placeholder="חיפוש לפי שם, חברה, אימייל..."
          />
        </div>
      </div>

      {/* טבלה */}
      <div className={cardClass + " overflow-x-auto"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border text-right">
              <th className="px-4 py-3 font-medium text-brand-muted">שם</th>
              <th className="px-4 py-3 font-medium text-brand-muted">סוג</th>
              <th className="px-4 py-3 font-medium text-brand-muted">תחום</th>
              <th className="px-4 py-3 font-medium text-brand-muted">טלפון</th>
              <th className="px-4 py-3 font-medium text-brand-muted">תפקיד</th>
              <th className="px-4 py-3 font-medium text-brand-muted">חברה</th>
              <th className="px-4 py-3 font-medium text-brand-muted">אימייל</th>
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
                  לא נמצאו ספקים
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg"
                >
                  <td className="px-4 py-3 font-medium text-brand-dark">
                    {s.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        TYPE_COLORS[s.type] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {s.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        FIELD_COLORS[s.field] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {s.field}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-dark">{s.phone}</td>
                  <td className="px-4 py-3 text-brand-dark">{s.role}</td>
                  <td className="px-4 py-3 text-brand-dark">{s.company}</td>
                  <td className="px-4 py-3 text-brand-dark">{s.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(s)}
                        className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                        title="עריכה"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(s.id)}
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

      {/* מודאל אישור מחיקה */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="אישור מחיקה"
        size="sm"
      >
        <p className="mb-4 text-sm text-brand-dark">
          האם למחוק את הספק? לא ניתן לבטל פעולה זו.
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
        title={editingSupplier ? "עריכת ספק" : "הוספת ספק"}
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

            {/* סוג */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                סוג
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={inputClass}
              >
                {SUPPLIER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* תחום */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                תחום
              </label>
              <select
                value={form.field}
                onChange={(e) => setForm({ ...form, field: e.target.value })}
                className={inputClass}
              >
                {SUPPLIER_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
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

            {/* תפקיד */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                תפקיד
              </label>
              <input
                type="text"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={inputClass}
                placeholder="תפקיד"
              />
            </div>

            {/* חברה */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                חברה
              </label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className={inputClass}
                placeholder="שם חברה"
              />
            </div>

            {/* אימייל */}
            <div className="sm:col-span-2">
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
              {editingSupplier ? "עדכון" : "הוספה"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
