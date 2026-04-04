"use client";

import { useState } from "react";
import {
  Plus,
  Phone,
  Mail,
  Building2,
  Calendar,
  FileText,
  PhoneCall,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useApp } from "@/lib/data/context";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  INTERESTED_SERVICES,
  type Lead,
  type LeadCall,
} from "@/lib/data/types";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";

/* ── עזר ── */

function getStatusInfo(status: string) {
  return LEAD_STATUSES.find((s) => s.value === status) ?? LEAD_STATUSES[0];
}
function getSourceLabel(source: string) {
  return LEAD_SOURCES.find((s) => s.value === source)?.label ?? source;
}
function formatDate(dateStr: string) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ── סגנונות ── */

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const btnPrimary =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";
const btnSecondary =
  "rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg";
const cardClass =
  "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

/* ── סטטוסים לקנבן ── */

const KANBAN_COLUMNS: { value: Lead["status"]; label: string }[] = [
  { value: "new", label: "\u05D7\u05D3\u05E9" },
  { value: "contacted", label: "\u05E0\u05D5\u05E6\u05E8 \u05E7\u05E9\u05E8" },
  { value: "meeting_set", label: "\u05E0\u05E7\u05D1\u05E2\u05D4 \u05E4\u05D2\u05D9\u05E9\u05D4" },
  { value: "proposal_sent", label: "\u05E0\u05E9\u05DC\u05D7\u05D4 \u05D4\u05E6\u05E2\u05D4" },
  { value: "negotiation", label: "\u05DE\u05E9\u05D0 \u05D5\u05DE\u05EA\u05DF" },
  { value: "won", label: "\u05E0\u05E1\u05D2\u05E8" },
  { value: "lost", label: "\u05E0\u05E4\u05E1\u05DC" },
];

/* ── Kanban Droppable Column ── */

function KanbanColumn({
  status,
  label,
  leads,
  onCardClick,
}: {
  status: string;
  label: string;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] w-64 shrink-0 flex-col rounded-lg bg-brand-bg p-3 transition-colors duration-200 ${
        isOver ? "ring-2 ring-brand-gold" : ""
      }`}
    >
      {/* כותרת עמודה */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-dark">{label}</h3>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-border px-1.5 text-xs font-medium text-brand-dark">
          {leads.length}
        </span>
      </div>

      {/* כרטיסים */}
      <div className="flex flex-1 flex-col gap-2">
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
        ))}
      </div>
    </div>
  );
}

/* ── Kanban Draggable Card ── */

function KanbanCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
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
      <p className="text-sm font-medium text-brand-dark">{lead.name}</p>
      {lead.company && (
        <p className="mt-0.5 text-xs text-brand-muted">{lead.company}</p>
      )}
      {lead.value > 0 && (
        <p className="mt-1 text-xs font-medium text-brand-dark">
          {"\u20AA"} {lead.value.toLocaleString()}
        </p>
      )}
      {lead.nextFollowUp && (
        <div className="mt-1 flex items-center gap-1 text-xs text-brand-muted">
          <Calendar className="h-3 w-3" />
          {formatDate(lead.nextFollowUp)}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   דף ראשי CRM
   ══════════════════════════════════════════ */

export default function CrmPage() {
  const { leads, addLead, updateLead, addLeadCall, employees, settings } =
    useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState<"table" | "kanban">("table");

  /* ── טופס ליד חדש ── */

  const emptyForm = {
    name: "",
    company: "",
    email: "",
    phone: "",
    website: "",
    digitalAssets: "",
    leadFacebookPage: "",
    leadInstagram: "",
    leadLinkedin: "",
    leadTiktok: "",
    leadGoogleAds: "",
    leadMetaAds: "",
    estimatedBudget: "",
    salesPerson: "",
    interestedServices: [] as string[],
    source: "other" as Lead["source"],
    status: "new" as Lead["status"],
    value: "",
    nextFollowUp: "",
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);

  const resetForm = () => setForm(emptyForm);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    addLead({
      ...form,
      value: Number(form.value) || 0,
      hasProposal: false,
      proposalDate: "",
      proposalFileName: "",
      internalNotes: "",
    });
    resetForm();
    setIsModalOpen(false);
  };

  const toggleService = (service: string) => {
    setForm((p) => ({
      ...p,
      interestedServices: p.interestedServices.includes(service)
        ? p.interestedServices.filter((s) => s !== service)
        : [...p.interestedServices, service],
    }));
  };

  /* ── טופס שיחה חדשה ── */

  const [callForm, setCallForm] = useState({
    date: "",
    summary: "",
    caller: "",
  });

  const handleAddCall = () => {
    if (!selectedLead || !callForm.date || !callForm.summary.trim()) return;
    addLeadCall(selectedLead.id, {
      date: callForm.date,
      summary: callForm.summary,
      caller: callForm.caller,
    });
    setCallForm({ date: "", summary: "", caller: "" });
    const updated = leads.find((l) => l.id === selectedLead.id);
    if (updated)
      setSelectedLead({
        ...updated,
        calls: [...updated.calls, { id: `temp`, ...callForm }],
      });
  };

  /* ── הצעה ופנימי ── */

  const handleProposalToggle = () => {
    if (!selectedLead) return;
    updateLead(selectedLead.id, { hasProposal: !selectedLead.hasProposal });
    setSelectedLead((p) =>
      p ? { ...p, hasProposal: !p.hasProposal } : null,
    );
  };

  const handleProposalDateChange = (date: string) => {
    if (!selectedLead) return;
    updateLead(selectedLead.id, { proposalDate: date });
    setSelectedLead((p) => (p ? { ...p, proposalDate: date } : null));
  };

  const handleProposalFileChange = (fileName: string) => {
    if (!selectedLead) return;
    updateLead(selectedLead.id, { proposalFileName: fileName });
    setSelectedLead((p) => (p ? { ...p, proposalFileName: fileName } : null));
  };

  const [internalNotesLocal, setInternalNotesLocal] = useState("");

  const openDetailModal = (lead: Lead) => {
    setSelectedLead(lead);
    setInternalNotesLocal(lead.internalNotes);
    setCallForm({ date: "", summary: "", caller: "" });
  };

  const handleSaveInternalNotes = () => {
    if (!selectedLead) return;
    updateLead(selectedLead.id, { internalNotes: internalNotesLocal });
    setSelectedLead((p) =>
      p ? { ...p, internalNotes: internalNotesLocal } : null,
    );
  };

  const handleStatusChange = (status: Lead["status"]) => {
    if (!selectedLead) return;
    updateLead(selectedLead.id, { status });
    setSelectedLead((p) => (p ? { ...p, status } : null));
  };

  /* ── Kanban drag-and-drop ── */

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const newStatus = over.id as Lead["status"];

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    updateLead(leadId, { status: newStatus });
  };

  /* ── פילטר ו-KPI ── */

  const filteredLeads =
    filterStatus === "all"
      ? leads
      : leads.filter((l) => l.status === filterStatus);

  const totalValue = leads
    .filter((l) => l.status !== "lost")
    .reduce((s, l) => s + l.value, 0);
  const newLeads = leads.filter((l) => l.status === "new").length;
  const wonLeads = leads.filter((l) => l.status === "won").length;

  // עדכון selectedLead כשה-leads משתנים
  const currentSelectedLead = selectedLead
    ? leads.find((l) => l.id === selectedLead.id) ?? selectedLead
    : null;

  return (
    <div className="space-y-6">
      {/* כותרת + כפתור */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-dark">
          CRM &mdash; לידים
        </h1>
        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className={`flex items-center gap-2 ${btnPrimary}`}
        >
          <Plus className="h-4 w-4" />
          ליד חדש
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
          <p className="text-sm text-brand-muted">סה״כ לידים</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {leads.length}
          </p>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
          <p className="text-sm text-brand-muted">חדשים</p>
          <p className="mt-1 text-2xl font-semibold text-brand-info">
            {newLeads}
          </p>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
          <p className="text-sm text-brand-muted">נסגרו</p>
          <p className="mt-1 text-2xl font-semibold text-brand-success">
            {wonLeads}
          </p>
        </div>
        <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
          <p className="text-sm text-brand-muted">ערך צפוי</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {"\u20AA"} {totalValue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* טאבים + פילטר */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* טאבים */}
        <div className="flex items-center gap-1 rounded-full border border-brand-border bg-brand-bg p-1">
          <button
            onClick={() => setActiveTab("table")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
              activeTab === "table"
                ? "bg-brand-gold text-brand-dark"
                : "bg-brand-bg text-brand-muted hover:text-brand-dark"
            }`}
          >
            כל הלידים
          </button>
          <button
            onClick={() => setActiveTab("kanban")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
              activeTab === "kanban"
                ? "bg-brand-gold text-brand-dark"
                : "bg-brand-bg text-brand-muted hover:text-brand-dark"
            }`}
          >
            Kanban
          </button>
        </div>

        {/* פילטר סטטוס */}
        {activeTab === "table" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-brand-muted">סטטוס:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-sm text-brand-dark focus:border-brand-gold focus:outline-none"
            >
              <option value="all">הכל</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ========== תצוגת טבלה ========== */}
      {activeTab === "table" && (
        <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg/50">
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">
                    שם
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">
                    חברה
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">
                    מקור
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">
                    ערך
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">
                    סטטוס
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">
                    מעקב הבא
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-brand-muted">
                    פרטי קשר
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-brand-muted"
                    >
                      אין לידים להצגה
                    </td>
                  </tr>
                )}
                {filteredLeads.map((lead) => {
                  const statusInfo = getStatusInfo(lead.status);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => openDetailModal(lead)}
                      className="cursor-pointer border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg/30"
                    >
                      <td className="px-4 py-4 font-medium text-brand-dark">
                        {lead.name}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-brand-muted">
                          <Building2 className="h-3.5 w-3.5" />
                          {lead.company || "\u2014"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-brand-muted">
                        {getSourceLabel(lead.source)}
                      </td>
                      <td className="px-4 py-4 text-brand-dark">
                        {lead.value > 0
                          ? `\u20AA ${lead.value.toLocaleString()}`
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-bg px-2.5 py-1 text-xs font-medium">
                          <span
                            className={`h-2 w-2 rounded-full ${statusInfo.color}`}
                          />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-xs text-brand-muted">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(lead.nextFollowUp)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div
                          className="flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="rounded-lg p-1 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                            >
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                          {lead.email && (
                            <a
                              href={`mailto:${lead.email}`}
                              className="rounded-lg p-1 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
                            >
                              <Mail className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== תצוגת Kanban ========== */}
      {activeTab === "kanban" && (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {KANBAN_COLUMNS.map((col) => {
              const columnLeads = leads.filter((l) => l.status === col.value);
              return (
                <KanbanColumn
                  key={col.value}
                  status={col.value}
                  label={col.label}
                  leads={columnLeads}
                  onCardClick={openDetailModal}
                />
              );
            })}
          </div>
        </DndContext>
      )}

      {/* ========== מודל ליד חדש ========== */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="ליד חדש"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* שם */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                שם
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                className={inputClass}
                placeholder="שם איש הקשר"
                required
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
                onChange={(e) =>
                  setForm((p) => ({ ...p, company: e.target.value }))
                }
                className={inputClass}
                placeholder="שם החברה"
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
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                className={inputClass}
                placeholder="email@example.com"
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
                onChange={(e) =>
                  setForm((p) => ({ ...p, phone: e.target.value }))
                }
                className={inputClass}
                placeholder="050-0000000"
              />
            </div>
            {/* אתר */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                אתר
              </label>
              <input
                type="url"
                value={form.website}
                onChange={(e) =>
                  setForm((p) => ({ ...p, website: e.target.value }))
                }
                className={inputClass}
                placeholder="https://example.co.il"
              />
            </div>

            {/* ── נכסים דיגיטליים ── */}
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-semibold text-brand-dark">
                נכסים דיגיטליים
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Facebook */}
                <div>
                  <label className="mb-1 block text-xs text-brand-muted">
                    עמוד פייסבוק
                  </label>
                  <input
                    type="url"
                    value={form.leadFacebookPage}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        leadFacebookPage: e.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="https://facebook.com/..."
                  />
                </div>
                {/* Instagram */}
                <div>
                  <label className="mb-1 block text-xs text-brand-muted">
                    אינסטגרם
                  </label>
                  <input
                    type="url"
                    value={form.leadInstagram}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        leadInstagram: e.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="https://instagram.com/..."
                  />
                </div>
                {/* LinkedIn */}
                <div>
                  <label className="mb-1 block text-xs text-brand-muted">
                    לינקדאין
                  </label>
                  <input
                    type="url"
                    value={form.leadLinkedin}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        leadLinkedin: e.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
                {/* TikTok */}
                <div>
                  <label className="mb-1 block text-xs text-brand-muted">
                    טיקטוק
                  </label>
                  <input
                    type="url"
                    value={form.leadTiktok}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        leadTiktok: e.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="https://tiktok.com/@..."
                  />
                </div>
                {/* Google Ads */}
                <div>
                  <label className="mb-1 block text-xs text-brand-muted">
                    Google Ads
                  </label>
                  <input
                    type="text"
                    value={form.leadGoogleAds}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        leadGoogleAds: e.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="מזהה חשבון Google Ads"
                  />
                </div>
                {/* Meta Ads */}
                <div>
                  <label className="mb-1 block text-xs text-brand-muted">
                    Meta Ads
                  </label>
                  <input
                    type="text"
                    value={form.leadMetaAds}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        leadMetaAds: e.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="מזהה חשבון Meta Ads"
                  />
                </div>
              </div>
            </div>

            {/* תקציב משוער */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                תקציב משוער
              </label>
              <input
                type="text"
                value={form.estimatedBudget}
                onChange={(e) =>
                  setForm((p) => ({ ...p, estimatedBudget: e.target.value }))
                }
                className={inputClass}
                placeholder="10,000-20,000"
              />
            </div>
            {/* איש מכירות */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                איש מכירות
              </label>
              <select
                value={form.salesPerson}
                onChange={(e) =>
                  setForm((p) => ({ ...p, salesPerson: e.target.value }))
                }
                className={inputClass}
              >
                <option value="">בחר איש מכירות</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>
            {/* שירותים מבוקשים */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                שירותים מבוקשים
              </label>
              <div className="flex flex-wrap gap-2">
                {INTERESTED_SERVICES.map((service) => (
                  <button
                    key={service}
                    type="button"
                    onClick={() => toggleService(service)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                      form.interestedServices.includes(service)
                        ? "bg-brand-gold text-brand-dark"
                        : "border border-brand-border bg-brand-bg text-brand-muted hover:bg-brand-bg/80"
                    }`}
                  >
                    {service}
                  </button>
                ))}
              </div>
            </div>
            {/* מקור */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                מקור
              </label>
              <select
                value={form.source}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    source: e.target.value as Lead["source"],
                  }))
                }
                className={inputClass}
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {/* סטטוס */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                סטטוס
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    status: e.target.value as Lead["status"],
                  }))
                }
                className={inputClass}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {/* ערך עסקה */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                ערך עסקה משוער ({"\u20AA"})
              </label>
              <input
                type="number"
                value={form.value}
                onChange={(e) =>
                  setForm((p) => ({ ...p, value: e.target.value }))
                }
                className={inputClass}
                placeholder="0"
              />
            </div>
            {/* מעקב הבא */}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                מעקב הבא
              </label>
              <input
                type="date"
                value={form.nextFollowUp}
                onChange={(e) =>
                  setForm((p) => ({ ...p, nextFollowUp: e.target.value }))
                }
                className={inputClass}
              />
            </div>
            {/* הערות */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                הערות
              </label>
              <textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                rows={3}
                className={inputClass}
                placeholder="פרטים נוספים על הליד..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className={btnSecondary}
            >
              ביטול
            </button>
            <button type="submit" className={btnPrimary}>
              שמור ליד
            </button>
          </div>
        </form>
      </Modal>

      {/* ========== מודל פרטי ליד ========== */}
      <Modal
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={
          currentSelectedLead
            ? `${currentSelectedLead.name} \u2014 פרטי ליד`
            : "פרטי ליד"
        }
        size="lg"
      >
        {currentSelectedLead && (
          <div className="space-y-6">
            {/* סיכום פרטים */}
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-semibold text-brand-dark">
                פרטי ליד
              </h3>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-brand-muted">חברה: </span>
                  <span className="text-brand-dark">
                    {currentSelectedLead.company || "\u2014"}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">אימייל: </span>
                  <span className="text-brand-dark">
                    {currentSelectedLead.email || "\u2014"}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">טלפון: </span>
                  <span className="text-brand-dark">
                    {currentSelectedLead.phone || "\u2014"}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">אתר: </span>
                  <span className="text-brand-dark">
                    {currentSelectedLead.website || "\u2014"}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">תקציב משוער: </span>
                  <span className="text-brand-dark">
                    {currentSelectedLead.estimatedBudget || "\u2014"}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">איש מכירות: </span>
                  <span className="text-brand-dark">
                    {currentSelectedLead.salesPerson || "\u2014"}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">מקור: </span>
                  <span className="text-brand-dark">
                    {getSourceLabel(currentSelectedLead.source)}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">ערך: </span>
                  <span className="text-brand-dark">
                    {currentSelectedLead.value > 0
                      ? `\u20AA ${currentSelectedLead.value.toLocaleString()}`
                      : "\u2014"}
                  </span>
                </div>
                <div>
                  <span className="text-brand-muted">מעקב הבא: </span>
                  <span className="text-brand-dark">
                    {formatDate(currentSelectedLead.nextFollowUp)}
                  </span>
                </div>

                {/* נכסים דיגיטליים בפרטי ליד */}
                {currentSelectedLead.leadFacebookPage && (
                  <div>
                    <span className="text-brand-muted">פייסבוק: </span>
                    <a
                      href={currentSelectedLead.leadFacebookPage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-info underline"
                    >
                      {currentSelectedLead.leadFacebookPage}
                    </a>
                  </div>
                )}
                {currentSelectedLead.leadInstagram && (
                  <div>
                    <span className="text-brand-muted">אינסטגרם: </span>
                    <a
                      href={currentSelectedLead.leadInstagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-info underline"
                    >
                      {currentSelectedLead.leadInstagram}
                    </a>
                  </div>
                )}
                {currentSelectedLead.leadLinkedin && (
                  <div>
                    <span className="text-brand-muted">לינקדאין: </span>
                    <a
                      href={currentSelectedLead.leadLinkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-info underline"
                    >
                      {currentSelectedLead.leadLinkedin}
                    </a>
                  </div>
                )}
                {currentSelectedLead.leadTiktok && (
                  <div>
                    <span className="text-brand-muted">טיקטוק: </span>
                    <a
                      href={currentSelectedLead.leadTiktok}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-info underline"
                    >
                      {currentSelectedLead.leadTiktok}
                    </a>
                  </div>
                )}
                {currentSelectedLead.leadGoogleAds && (
                  <div>
                    <span className="text-brand-muted">Google Ads: </span>
                    <span className="text-brand-dark">
                      {currentSelectedLead.leadGoogleAds}
                    </span>
                  </div>
                )}
                {currentSelectedLead.leadMetaAds && (
                  <div>
                    <span className="text-brand-muted">Meta Ads: </span>
                    <span className="text-brand-dark">
                      {currentSelectedLead.leadMetaAds}
                    </span>
                  </div>
                )}

                {currentSelectedLead.interestedServices.length > 0 && (
                  <div className="sm:col-span-2">
                    <span className="text-brand-muted">שירותים מבוקשים: </span>
                    <span className="text-brand-dark">
                      {currentSelectedLead.interestedServices.join(", ")}
                    </span>
                  </div>
                )}
                {currentSelectedLead.notes && (
                  <div className="sm:col-span-2">
                    <span className="text-brand-muted">הערות: </span>
                    <span className="text-brand-dark">
                      {currentSelectedLead.notes}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* עדכון סטטוס */}
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-semibold text-brand-dark">
                עדכון סטטוס
              </h3>
              <select
                value={currentSelectedLead.status}
                onChange={(e) =>
                  handleStatusChange(e.target.value as Lead["status"])
                }
                className={inputClass}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* היסטוריית שיחות */}
            <div className={cardClass}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-dark">
                <PhoneCall className="h-4 w-4" />
                היסטוריית שיחות
              </h3>
              {currentSelectedLead.calls.length === 0 ? (
                <p className="text-sm text-brand-muted">אין שיחות רשומות</p>
              ) : (
                <div className="mb-4 space-y-2">
                  {currentSelectedLead.calls.map((call) => (
                    <div
                      key={call.id}
                      className="rounded-lg border border-brand-border bg-brand-bg p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-brand-dark">
                          {formatDate(call.date)}
                        </span>
                        <span className="text-xs text-brand-muted">
                          {call.caller}
                        </span>
                      </div>
                      <p className="mt-1 text-brand-muted">{call.summary}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* הוספת שיחה */}
              <div className="border-t border-brand-border pt-3">
                <h4 className="mb-2 text-xs font-medium text-brand-muted">
                  הוסף שיחה חדשה
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="date"
                    value={callForm.date}
                    onChange={(e) =>
                      setCallForm((p) => ({ ...p, date: e.target.value }))
                    }
                    className={inputClass}
                  />
                  <select
                    value={callForm.caller}
                    onChange={(e) =>
                      setCallForm((p) => ({ ...p, caller: e.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">בחר מתקשר</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                  <div className="sm:col-span-2">
                    <textarea
                      value={callForm.summary}
                      onChange={(e) =>
                        setCallForm((p) => ({
                          ...p,
                          summary: e.target.value,
                        }))
                      }
                      rows={2}
                      className={inputClass}
                      placeholder="תקציר השיחה..."
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddCall}
                  disabled={!callForm.date || !callForm.summary.trim()}
                  className={`mt-2 ${btnPrimary} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  הוסף שיחה
                </button>
              </div>
            </div>

            {/* הצעת מחיר */}
            <div className={cardClass}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-dark">
                <FileText className="h-4 w-4" />
                הצעת מחיר
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-brand-dark">
                    נשלחה הצעה?
                  </label>
                  <button
                    type="button"
                    onClick={handleProposalToggle}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                      currentSelectedLead.hasProposal
                        ? "bg-brand-gold"
                        : "bg-brand-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                        currentSelectedLead.hasProposal
                          ? "translate-x-1.5"
                          : "translate-x-6"
                      }`}
                    />
                  </button>
                </div>

                {currentSelectedLead.hasProposal && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-brand-muted">
                        תאריך הצעה
                      </label>
                      <input
                        type="date"
                        value={currentSelectedLead.proposalDate}
                        onChange={(e) =>
                          handleProposalDateChange(e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-brand-muted">
                        שם קובץ
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={currentSelectedLead.proposalFileName}
                          onChange={(e) =>
                            handleProposalFileChange(e.target.value)
                          }
                          className={inputClass}
                          placeholder="proposal.pdf"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const name =
                              currentSelectedLead.proposalFileName ||
                              `הצעה_${currentSelectedLead.name}.pdf`;
                            handleProposalFileChange(name);
                          }}
                          className={`shrink-0 ${btnPrimary}`}
                        >
                          העלאה
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* הערות פנימיות */}
            <div className={cardClass}>
              <h3 className="mb-3 text-sm font-semibold text-brand-dark">
                הערות פנימיות
              </h3>
              <textarea
                value={internalNotesLocal}
                onChange={(e) => setInternalNotesLocal(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="הערות פנימיות שלא נראות ללקוח..."
              />
              <button
                type="button"
                onClick={handleSaveInternalNotes}
                className={`mt-2 ${btnPrimary}`}
              >
                שמור הערות
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
