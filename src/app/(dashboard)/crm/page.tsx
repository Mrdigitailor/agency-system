"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus,
  Phone,
  Mail,
  Building2,
  Calendar,
  FileText,
  PhoneCall,
  Search,
  Star,
  X,
  Pencil,
  Filter,
  Trash2,
  Eye,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import Modal from "@/components/ui/Modal";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useApp } from "@/lib/data/context";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  INTERESTED_SERVICES,
  type Lead,
  type LeadCall,
} from "@/lib/data/types";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";

/* ── עזר ── */

// הצעות המחיר שמורות ב-Blob פרטי — צפייה/הורדה עוברות דרך route מאובטח
function proposalFileUrl(blobUrl: string, download = false) {
  return `/api/blob/proposal?url=${encodeURIComponent(blobUrl)}${download ? "&download=1" : ""}`;
}

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
function monthsBetween(start: string, end: string) {
  if (!start) return 0;
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const diff = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, diff);
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

/* ── קבועים ── */

const CHURN_REASONS = [
  { value: "price", label: "מחיר" },
  { value: "no_results", label: "לא ראה תוצאות" },
  { value: "service", label: "שירות" },
  { value: "competition", label: "תחרות" },
  { value: "personal", label: "סיבה אישית" },
  { value: "other", label: "אחר" },
];

const KANBAN_COLUMNS: { value: Lead["status"]; label: string }[] = [
  { value: "new", label: "חדש" },
  { value: "contacted", label: "נוצר קשר" },
  { value: "meeting_set", label: "נקבעה פגישה" },
  { value: "proposal_sent", label: "נשלחה הצעה" },
  { value: "negotiation", label: "משא ומתן" },
];

const SOURCE_COLORS: Record<string, string> = {
  website: "bg-brand-info/20 text-brand-info",
  referral: "bg-brand-success/20 text-brand-success",
  social: "bg-purple-100 text-purple-700",
  cold_call: "bg-brand-warning/20 text-brand-warning",
  event: "bg-pink-100 text-pink-700",
  other: "bg-gray-100 text-brand-muted",
};

/* ── StarRating ── */

function StarRating({
  value,
  onChange,
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
}) {
  return (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly || !onChange}
          onClick={() => onChange?.(value === star ? 0 : star)}
          className={`text-sm ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110"} transition-transform`}
        >
          {star <= value ? "⭐" : "☆"}
        </button>
      ))}
    </div>
  );
}

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
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-brand-dark">{label}</h3>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-border px-1.5 text-xs font-medium text-brand-dark">
          {leads.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
        ))}
      </div>
    </div>
  );
}

/* ── Kanban Draggable Card ── */

// תוויות + לוגיקת צ'יפ "הצעד הבא" — הלב של שיטת המכירה מבוססת-הפעולות
const NEXT_ACTION_LABELS: Record<string, string> = { call: "שיחה", meeting: "פגישה", followup: "פולו-אפ", proposal: "הצעה", other: "צעד" };
const OPEN_STATUSES = ["new", "contacted", "meeting_set", "proposal_sent", "negotiation"];
const STAGE_ROT_DAYS: Record<string, number> = { new: 1, contacted: 5, meeting_set: 7, proposal_sent: 7, negotiation: 10 };

function nextActionChip(lead: Lead): { text: string; cls: string } | null {
  if (!OPEN_STATUSES.includes(lead.status)) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  if (!lead.nextFollowUp) return { text: "⚠ אין צעד הבא", cls: "bg-brand-danger/10 text-brand-danger font-semibold" };
  const label = NEXT_ACTION_LABELS[lead.nextActionType] || "צעד";
  if (lead.nextFollowUp < today) {
    const days = Math.round((new Date(today).getTime() - new Date(lead.nextFollowUp).getTime()) / 86400000);
    return { text: `${label} · באיחור ${days} ימ׳`, cls: "bg-brand-danger/10 text-brand-danger font-semibold" };
  }
  if (lead.nextFollowUp === today) return { text: `${label} · היום`, cls: "bg-brand-warning/15 text-brand-warning font-semibold" };
  const due = new Date(lead.nextFollowUp).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  return { text: `${label} · ${due}`, cls: "bg-brand-success/10 text-brand-success" };
}

/** ימים בסטטוס הנוכחי — לזיהוי לידים "רקובים" */
function daysInStage(lead: Lead): number {
  const since = lead.stageChangedAt || (lead.createdAt ? String(lead.createdAt).slice(0, 10) : "");
  if (!since) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 86400000));
}

function KanbanCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const chip = nextActionChip(lead);
  const inStage = daysInStage(lead);
  const rotThreshold = STAGE_ROT_DAYS[lead.status];
  const isRotting = OPEN_STATUSES.includes(lead.status) && rotThreshold !== undefined && inStage > rotThreshold;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`cursor-grab rounded-lg border bg-brand-light p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${
        isDragging ? "opacity-50 shadow-lg" : ""
      } ${isRotting ? "border-brand-danger/60" : "border-brand-border"}`}
    >
      <p className="mb-1 text-[11px] text-brand-muted">{formatDate(lead.createdAt)}</p>
      <p className="text-sm font-semibold text-brand-dark">{lead.name}</p>
      {lead.qualityRating > 0 && (
        <StarRating value={lead.qualityRating} readonly />
      )}
      <div className="mt-1">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
          {getSourceLabel(lead.source)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {lead.phone && <Phone className="h-3 w-3 text-brand-muted" />}
        {lead.email && <Mail className="h-3 w-3 text-brand-muted" />}
      </div>
      {(lead.dealValue > 0 || lead.value > 0) && (
        <p className="mt-1 text-xs font-medium text-brand-success">
          ₪ {(lead.dealValue || lead.value).toLocaleString()}
        </p>
      )}
      {/* צ'יפ הצעד הבא — ירוק מתוזמן / כתום היום / אדום באיחור או חסר */}
      {chip && (
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${chip.cls}`} title={lead.nextActionNote || ""}>{chip.text}</span>
          {isRotting && <span className="text-[10px] font-medium text-brand-danger" title={`הליד תקוע בשלב הזה ${inStage} ימים`}>🐌 {inStage} ימ׳</span>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   דף ראשי CRM
   ══════════════════════════════════════════ */

export default function CrmPage() {
  const { leads, addLead, updateLead, deleteLead, addLeadCall, employees, settings } =
    useApp();
  const { t, lang } = useLanguage();

  /* ── Lead Sources (dynamic) ── */
  const [dynamicSources, setDynamicSources] = useState<{ value: string; label: string }[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [newSourceMode, setNewSourceMode] = useState(false);
  const [newSourceInput, setNewSourceInput] = useState("");
  const [editNewSourceMode, setEditNewSourceMode] = useState(false);
  const [editNewSourceInput, setEditNewSourceInput] = useState("");

  const allSources = useMemo(() => {
    if (sourcesLoaded && dynamicSources.length > 0) return dynamicSources;
    return LEAD_SOURCES as unknown as { value: string; label: string }[];
  }, [sourcesLoaded, dynamicSources]);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/lead-sources");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // API returns { id, name } — map to { value, label }
          setDynamicSources(data.map((s: { name: string }) => ({ value: s.name, label: s.name })));
        }
      }
    } catch {
      // fallback to LEAD_SOURCES
    } finally {
      setSourcesLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleAddCustomSource = async (
    sourceLabel: string,
    onSelect: (value: string) => void,
    resetMode: () => void,
  ) => {
    const name = sourceLabel.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/lead-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        await fetchSources();
      } else {
        setDynamicSources((prev) => [...prev, { value: name, label: name }]);
      }
    } catch {
      setDynamicSources((prev) => [...prev, { value: name, label: name }]);
    }
    onSelect(name);
    resetMode();
  };

  /* ── State ── */
  const [subTab, setSubTab] = useState<"leads" | "closings" | "churned">("leads");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isChurnModalOpen, setIsChurnModalOpen] = useState(false);
  const [churnTarget, setChurnTarget] = useState<Lead | null>(null);

  /* ── Collapsible filter state ── */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [closingsFiltersOpen, setClosingsFiltersOpen] = useState(false);
  const [churnedFiltersOpen, setChurnedFiltersOpen] = useState(false);

  /* ── Filters ── */
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterQuality, setFilterQuality] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterValueMin, setFilterValueMin] = useState("");
  const [filterValueMax, setFilterValueMax] = useState("");

  const clearFilters = () => {
    setSearchQuery("");
    setFilterSource("all");
    setFilterStatus("all");
    setFilterQuality("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterValueMin("");
    setFilterValueMax("");
  };

  /* ── Closings tab filters ── */
  const [closingsSearch, setClosingsSearch] = useState("");
  const [closingsSource, setClosingsSource] = useState("all");
  const [closingsDateFrom, setClosingsDateFrom] = useState("");
  const [closingsDateTo, setClosingsDateTo] = useState("");
  const [closingsValueMin, setClosingsValueMin] = useState("");
  const [closingsValueMax, setClosingsValueMax] = useState("");
  const [closingsStatus, setClosingsStatus] = useState("all");

  const clearClosingsFilters = () => {
    setClosingsSearch("");
    setClosingsSource("all");
    setClosingsDateFrom("");
    setClosingsDateTo("");
    setClosingsValueMin("");
    setClosingsValueMax("");
    setClosingsStatus("all");
  };

  /* ── Churned tab filters ── */
  const [churnedSearch, setChurnedSearch] = useState("");
  const [churnedReasonFilter, setChurnedReasonFilter] = useState("all");
  const [churnedSource, setChurnedSource] = useState("all");
  const [churnedDateFrom, setChurnedDateFrom] = useState("");
  const [churnedDateTo, setChurnedDateTo] = useState("");

  const clearChurnedFilters = () => {
    setChurnedSearch("");
    setChurnedReasonFilter("all");
    setChurnedSource("all");
    setChurnedDateFrom("");
    setChurnedDateTo("");
  };

  /* ── Churn modal state ── */
  const [churnForm, setChurnForm] = useState({
    churnedAt: "",
    churnReason: "",
    churnDetails: "",
  });

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
      nextActionType: "",
      nextActionNote: "",
      stageChangedAt: "",
      hasProposal: false,
      proposalDate: "",
      proposalFileName: "",
      internalNotes: "",
      qualityRating: 0,
      dealValue: 0,
      monthlyValue: 0,
      serviceType: "",
      proposalUrl: "",
      closedAt: "",
      endDate: "",
      churnedAt: "",
      churnReason: "",
      churnDetails: "",
      proposalDetails: "",
      proposalUploadedAt: "",
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

  /* ── Edit form ── */
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  const openEditModal = (lead: Lead) => {
    setEditForm({ ...lead });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.id) return;
    const { id, calls, ...rest } = editForm as Lead;
    updateLead(id, rest);
    setIsEditModalOpen(false);
    if (selectedLead?.id === id) {
      setSelectedLead({ ...selectedLead, ...rest });
    }
  };

  const toggleEditService = (service: string) => {
    setEditForm((p) => ({
      ...p,
      interestedServices: (p.interestedServices || []).includes(service)
        ? (p.interestedServices || []).filter((s) => s !== service)
        : [...(p.interestedServices || []), service],
    }));
  };

  /* ── שיחה חדשה ── */
  const [callForm, setCallForm] = useState({ date: "", summary: "", caller: "" });

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
        calls: [...updated.calls, { id: `temp-${Date.now()}`, ...callForm }],
      });
  };

  /* ── הצעה ופנימי ── */
  const handleProposalToggle = () => {
    if (!selectedLead) return;
    updateLead(selectedLead.id, { hasProposal: !selectedLead.hasProposal });
    setSelectedLead((p) => (p ? { ...p, hasProposal: !p.hasProposal } : null));
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

  async function handleDeleteLead(leadId: string) {
    if (!confirm(lang === "he" ? "למחוק את הליד?" : "Delete this lead?")) return;
    await deleteLead(leadId);
    setSelectedLead(null);
  }

  const [proposalViewOpen, setProposalViewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleUploadProposal(file: File) {
    if (!selectedLead) return;
    if (file.size > 25 * 1024 * 1024) {
      alert("הקובץ גדול מדי. מקסימום 25MB");
      return;
    }
    console.log(`[Proposal] Uploading: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
    setUploading(true);
    setUploadProgress(0);
    try {
      // העלאה ישירה מהדפדפן ל-Vercel Blob — עוקפת את תקרת גוף-הבקשה (4.5MB)
      // שגרמה ל-"Request Entity Too Large". רק החלפת token עוברת דרך /api/upload.
      // multipart=true: מעלה במקטעים במקביל — הרבה יותר מהיר ואמין לקבצים גדולים.
      const blob = await upload(
        `proposals/${selectedLead.id}_${Date.now()}_${file.name}`,
        file,
        {
          // ה-store מוגדר private — access:"public" נדחה ע"י האחסון (זה מה שתקע העלאות)
          access: "private",
          handleUploadUrl: "/api/upload",
          contentType: file.type,
          multipart: true,
          onUploadProgress: (e) => setUploadProgress(Math.round(e.percentage)),
        },
      );

      // שמירת ה-URL ללקוח (Node.js route עם Prisma)
      await fetch(`/api/leads/${selectedLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalUrl: blob.url,
          proposalFileName: file.name,
          proposalUploadedAt: new Date().toISOString(),
        }),
      });

      setSelectedLead((p) => p ? { ...p, proposalUrl: blob.url, proposalFileName: file.name } : null);
    } catch (err) {
      console.error("[Proposal] Upload error:", err);
      alert(err instanceof Error ? err.message : "שגיאה בהעלאה");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteProposal() {
    if (!selectedLead) return;
    await updateLead(selectedLead.id, { proposalUrl: "", proposalFileName: "", proposalFileData: "" } as Partial<Lead>);
    setSelectedLead((p) => p ? { ...p, proposalUrl: "", proposalFileName: "" } : null);
  }

  const [internalNotesLocal, setInternalNotesLocal] = useState("");

  const openDetailModal = (lead: Lead) => {
    setSelectedLead(lead);
    setInternalNotesLocal(lead.internalNotes);
    setCallForm({ date: "", summary: "", caller: "" });
  };

  const handleSaveInternalNotes = () => {
    if (!selectedLead) return;
    updateLead(selectedLead.id, { internalNotes: internalNotesLocal });
    setSelectedLead((p) => (p ? { ...p, internalNotes: internalNotesLocal } : null));
  };

  const handleStatusChange = (newStatus: Lead["status"]) => {
    if (!selectedLead) return;
    if (newStatus === "churned") {
      setChurnTarget(selectedLead);
      setChurnForm({ churnedAt: new Date().toISOString().split("T")[0], churnReason: "", churnDetails: "" });
      setIsChurnModalOpen(true);
      return;
    }
    const extra: Partial<Lead> = {};
    if (newStatus === "won" && !selectedLead.closedAt) {
      extra.closedAt = new Date().toISOString().split("T")[0];
    }
    updateLead(selectedLead.id, { status: newStatus, ...extra });
    setSelectedLead((p) => (p ? { ...p, status: newStatus, ...extra } : null));
  };

  const handleChurnSubmit = () => {
    if (!churnTarget || !churnForm.churnedAt || !churnForm.churnReason) return;
    updateLead(churnTarget.id, {
      status: "churned",
      churnedAt: churnForm.churnedAt,
      churnReason: churnForm.churnReason,
      churnDetails: churnForm.churnDetails,
    });
    if (selectedLead?.id === churnTarget.id) {
      setSelectedLead((p) =>
        p ? { ...p, status: "churned", churnedAt: churnForm.churnedAt, churnReason: churnForm.churnReason, churnDetails: churnForm.churnDetails } : null,
      );
    }
    setIsChurnModalOpen(false);
    setChurnTarget(null);
  };

  /* ── Kanban drag-and-drop ── */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const leadId = active.id as string;
    const newStatus = over.id as Lead["status"];
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;
    if (newStatus === "churned") {
      setChurnTarget(lead);
      setChurnForm({ churnedAt: new Date().toISOString().split("T")[0], churnReason: "", churnDetails: "" });
      setIsChurnModalOpen(true);
      return;
    }
    const extra: Partial<Lead> = {};
    if (newStatus === "won" && !lead.closedAt) {
      extra.closedAt = new Date().toISOString().split("T")[0];
    }
    updateLead(leadId, { status: newStatus, ...extra });
  };

  /* ── Quality rating inline update ── */
  const handleQualityChange = (leadId: string, rating: number) => {
    updateLead(leadId, { qualityRating: rating });
  };

  /* ── Active filter counts ── */
  const activeFilterCount = [searchQuery, filterSource !== "all" ? filterSource : "", filterStatus !== "all" ? filterStatus : "", filterQuality !== "all" ? filterQuality : "", filterDateFrom, filterDateTo, filterValueMin, filterValueMax].filter(Boolean).length;
  const closingsFilterCount = [closingsSearch, closingsSource !== "all" ? closingsSource : "", closingsStatus !== "all" ? closingsStatus : "", closingsDateFrom, closingsDateTo, closingsValueMin, closingsValueMax].filter(Boolean).length;
  const churnedFilterCount = [churnedSearch, churnedReasonFilter !== "all" ? churnedReasonFilter : "", churnedSource !== "all" ? churnedSource : "", churnedDateFrom, churnedDateTo].filter(Boolean).length;

  /* ── Filtered data ── */
  const activeLeads = useMemo(() => {
    let result = leads.filter((l) => l.status !== "won" && l.status !== "churned");

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.email.toLowerCase().includes(q),
      );
    }
    if (filterSource !== "all") result = result.filter((l) => l.source === filterSource);
    if (filterStatus !== "all") result = result.filter((l) => l.status === filterStatus);
    if (filterQuality !== "all") result = result.filter((l) => l.qualityRating === Number(filterQuality));
    if (filterDateFrom) result = result.filter((l) => l.createdAt >= filterDateFrom);
    if (filterDateTo) result = result.filter((l) => l.createdAt <= filterDateTo);
    if (filterValueMin) result = result.filter((l) => (l.dealValue || l.value) >= Number(filterValueMin));
    if (filterValueMax) result = result.filter((l) => (l.dealValue || l.value) <= Number(filterValueMax));

    return result.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [leads, searchQuery, filterSource, filterStatus, filterQuality, filterDateFrom, filterDateTo, filterValueMin, filterValueMax]);

  const wonLeads = useMemo(() => {
    let result = leads.filter((l) => l.status === "won");
    if (closingsSearch) {
      const q = closingsSearch.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q));
    }
    if (closingsSource !== "all") result = result.filter((l) => l.source === closingsSource);
    if (closingsDateFrom) result = result.filter((l) => (l.closedAt || "") >= closingsDateFrom);
    if (closingsDateTo) result = result.filter((l) => (l.closedAt || "") <= closingsDateTo);
    if (closingsValueMin) result = result.filter((l) => (l.dealValue || l.value || 0) >= Number(closingsValueMin));
    if (closingsValueMax) result = result.filter((l) => (l.dealValue || l.value || 0) <= Number(closingsValueMax));
    if (closingsStatus !== "all") {
      if (closingsStatus === "active") {
        result = result.filter((l) => !l.endDate || new Date(l.endDate) > new Date());
      } else {
        result = result.filter((l) => l.endDate && new Date(l.endDate) <= new Date());
      }
    }
    return result.sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""));
  }, [leads, closingsSearch, closingsSource, closingsDateFrom, closingsDateTo, closingsValueMin, closingsValueMax, closingsStatus]);

  const churnedLeads = useMemo(() => {
    let result = leads.filter((l) => l.status === "churned");
    if (churnedSearch) {
      const q = churnedSearch.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(q));
    }
    if (churnedReasonFilter !== "all") result = result.filter((l) => l.churnReason === churnedReasonFilter);
    if (churnedSource !== "all") result = result.filter((l) => l.source === churnedSource);
    if (churnedDateFrom) result = result.filter((l) => (l.churnedAt || "") >= churnedDateFrom);
    if (churnedDateTo) result = result.filter((l) => (l.churnedAt || "") <= churnedDateTo);
    return result.sort((a, b) => (b.churnedAt || "").localeCompare(a.churnedAt || ""));
  }, [leads, churnedSearch, churnedReasonFilter, churnedSource, churnedDateFrom, churnedDateTo]);

  /* ── KPIs ── */
  const leadsKpi = useMemo(() => {
    const total = activeLeads.length;
    const totalValue = activeLeads.reduce((sum, l) => sum + (l.dealValue || l.value || 0), 0);
    const newCount = activeLeads.filter((l) => l.status === "new").length;
    const proposalCount = activeLeads.filter((l) => l.hasProposal).length;
    return { total, totalValue, newCount, proposalCount };
  }, [activeLeads]);

  const closingsKpi = useMemo(() => {
    const total = wonLeads.length;
    const totalDealValue = wonLeads.reduce((sum, l) => sum + (l.dealValue || 0), 0);
    const activeClients = wonLeads.filter((l) => !l.endDate || new Date(l.endDate) > new Date()).length;
    const avgDealValue = total > 0 ? Math.round(totalDealValue / total) : 0;
    return { total, totalDealValue, activeClients, avgDealValue };
  }, [wonLeads]);

  const churnedKpi = useMemo(() => {
    const total = churnedLeads.length;
    const avgMonths =
      total > 0
        ? Math.round(churnedLeads.reduce((sum, l) => sum + monthsBetween(l.closedAt, l.churnedAt), 0) / total)
        : 0;
    const reasonCounts: Record<string, number> = {};
    churnedLeads.forEach((l) => {
      if (l.churnReason) reasonCounts[l.churnReason] = (reasonCounts[l.churnReason] || 0) + 1;
    });
    const topReasons = Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([reason, count]) => ({
        label: CHURN_REASONS.find((r) => r.value === reason)?.label || reason,
        count,
      }));
    return { total, avgMonths, topReasons };
  }, [churnedLeads]);

  /* ══════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════ */

  return (
    <div className="space-y-6">
      {/* ── כותרת + טאבים ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-brand-dark">CRM</h1>
        <button onClick={() => setIsModalOpen(true)} className={btnPrimary}>
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t('newLead')}
          </span>
        </button>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 rounded-lg bg-brand-bg p-1">
        {(
          [
            { key: "leads", label: t('leads') },
            { key: "closings", label: t('closings') },
            { key: "churned", label: t('churned') },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              subTab === tab.key
                ? "bg-brand-light text-brand-dark shadow-sm"
                : "text-brand-muted hover:text-brand-dark"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════
         LEADS TAB
         ════════════════════════════════════════ */}
      {subTab === "leads" && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('totalLeads')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-dark">{leadsKpi.total}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('totalDealValue')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-dark">₪ {leadsKpi.totalValue.toLocaleString()}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('newLeads')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-info">{leadsKpi.newCount}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">הצעות נשלחו</p>
              <p className="mt-1 text-2xl font-semibold text-brand-warning">{leadsKpi.proposalCount}</p>
            </div>
          </div>

          {/* Filter bar */}
          <button onClick={() => setFiltersOpen(!filtersOpen)} className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg"><Filter className="h-4 w-4" />{t('filter')}{activeFilterCount > 0 && <span className="rounded-full bg-brand-gold px-2 py-0.5 text-xs font-bold text-brand-dark">{activeFilterCount}</span>}</button>
          {filtersOpen && (
          <div className={`${cardClass} space-y-3`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {/* Search */}
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                <input
                  type="text"
                  placeholder={`${t('search')}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`${inputClass} pr-9`}
                />
              </div>
              {/* Source */}
              <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className={inputClass}>
                <option value="all">{t('source')}</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {/* Status */}
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass}>
                <option value="all">{t('allStatuses')}</option>
                {KANBAN_COLUMNS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
                <option value="lost">אבד</option>
              </select>
              {/* Quality */}
              <select value={filterQuality} onChange={(e) => setFilterQuality(e.target.value)} className={inputClass}>
                <option value="all">{t('quality')}</option>
                {[1, 2, 3, 4, 5].map((q) => (
                  <option key={q} value={q}>{q} כוכבים</option>
                ))}
                <option value="0">ללא דירוג</option>
              </select>
              {/* Date range */}
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder={t('date')}
                className={inputClass}
              />
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder={t('date')}
                className={inputClass}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Value range */}
              <input
                type="number"
                value={filterValueMin}
                onChange={(e) => setFilterValueMin(e.target.value)}
                placeholder={t('value')}
                className={`${inputClass} w-36`}
              />
              <input
                type="number"
                value={filterValueMax}
                onChange={(e) => setFilterValueMax(e.target.value)}
                placeholder={t('value')}
                className={`${inputClass} w-36`}
              />
              <button onClick={clearFilters} className={btnSecondary}>
                <span className="flex items-center gap-1">
                  <X className="h-3 w-3" />
                  {t('clearFilters')}
                </span>
              </button>
              {/* View toggle */}
              <div className="mr-auto flex gap-1 rounded-lg bg-brand-bg p-1">
                <button
                  onClick={() => setViewMode("table")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-200 ${viewMode === "table" ? "bg-brand-light shadow-sm text-brand-dark" : "text-brand-muted"}`}
                >
                  טבלה
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-200 ${viewMode === "kanban" ? "bg-brand-light shadow-sm text-brand-dark" : "text-brand-muted"}`}
                >
                  קנבן
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Table view */}
          {viewMode === "table" && (
            <div className={`${cardClass} overflow-x-auto p-0`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-bg text-brand-muted">
                    <th className="px-4 py-3 text-right font-medium">{t('date')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('name')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('company')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('source')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('value')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('quality')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('status')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('dueDate')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('contactInfo')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLeads.map((lead) => {
                    const statusInfo = getStatusInfo(lead.status);
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => openDetailModal(lead)}
                        className="cursor-pointer border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg"
                      >
                        <td className="px-4 py-3 text-brand-muted">{formatDate(lead.createdAt)}</td>
                        <td className="px-4 py-3 font-medium text-brand-dark">{lead.name}</td>
                        <td className="px-4 py-3 text-brand-muted">{lead.company || "\u2014"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
                            {getSourceLabel(lead.source)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-brand-dark">
                          {(lead.dealValue || lead.value) > 0 ? `₪ ${(lead.dealValue || lead.value).toLocaleString()}` : "\u2014"}
                        </td>
                        <td className="px-4 py-3">
                          <StarRating
                            value={lead.qualityRating || 0}
                            onChange={(v) => handleQualityChange(lead.id, v)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium text-brand-light ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-brand-muted">
                          {lead.nextFollowUp ? (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(lead.nextFollowUp)}
                            </span>
                          ) : (
                            "\u2014"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {lead.phone && (
                              <a href={`tel:${lead.phone}`} className="text-brand-muted hover:text-brand-dark">
                                <Phone className="h-4 w-4" />
                              </a>
                            )}
                            {lead.email && (
                              <a href={`mailto:${lead.email}`} className="text-brand-muted hover:text-brand-dark">
                                <Mail className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {activeLeads.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-brand-muted">
                        {t('noResults')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Kanban view */}
          {viewMode === "kanban" && (
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {KANBAN_COLUMNS.map((col) => (
                  <KanbanColumn
                    key={col.value}
                    status={col.value}
                    label={col.label}
                    leads={activeLeads.filter((l) => l.status === col.value)}
                    onCardClick={openDetailModal}
                  />
                ))}
              </div>
            </DndContext>
          )}
        </>
      )}

      {/* ════════════════════════════════════════
         CLOSINGS TAB
         ════════════════════════════════════════ */}
      {subTab === "closings" && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('totalClosings')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-dark">{closingsKpi.total}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('totalDealValue')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-success">₪ {closingsKpi.totalDealValue.toLocaleString()}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('activeClients')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-info">{closingsKpi.activeClients}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('averageDealValue')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-dark">₪ {closingsKpi.avgDealValue.toLocaleString()}</p>
            </div>
          </div>

          {/* Closings Filter bar */}
          <button onClick={() => setClosingsFiltersOpen(!closingsFiltersOpen)} className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg"><Filter className="h-4 w-4" />{t('filter')}{closingsFilterCount > 0 && <span className="rounded-full bg-brand-gold px-2 py-0.5 text-xs font-bold text-brand-dark">{closingsFilterCount}</span>}</button>
          {closingsFiltersOpen && (
          <div className={`${cardClass} space-y-3`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                <input
                  type="text"
                  placeholder={`${t('search')}...`}
                  value={closingsSearch}
                  onChange={(e) => setClosingsSearch(e.target.value)}
                  className={`${inputClass} pr-9`}
                />
              </div>
              <select value={closingsSource} onChange={(e) => setClosingsSource(e.target.value)} className={inputClass}>
                <option value="all">{t('source')}</option>
                {allSources.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <input type="date" value={closingsDateFrom} onChange={(e) => setClosingsDateFrom(e.target.value)} placeholder={t('date')} className={inputClass} />
              <input type="date" value={closingsDateTo} onChange={(e) => setClosingsDateTo(e.target.value)} placeholder={t('date')} className={inputClass} />
              <input type="number" value={closingsValueMin} onChange={(e) => setClosingsValueMin(e.target.value)} placeholder={t('value')} className={inputClass} />
              <input type="number" value={closingsValueMax} onChange={(e) => setClosingsValueMax(e.target.value)} placeholder={t('value')} className={inputClass} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select value={closingsStatus} onChange={(e) => setClosingsStatus(e.target.value)} className={`${inputClass} w-36`}>
                <option value="all">{t('allStatuses')}</option>
                <option value="active">{t('active')}</option>
                <option value="ended">{t('ended')}</option>
              </select>
              <button onClick={clearClosingsFilters} className={btnSecondary}>
                <span className="flex items-center gap-1">
                  <X className="h-3 w-3" />
                  {t('clearFilters')}
                </span>
              </button>
            </div>
          </div>
          )}

          {/* Table */}
          <div className={`${cardClass} overflow-x-auto p-0`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg text-brand-muted">
                  <th className="px-4 py-3 text-right font-medium">{t('name')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('closingDate')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('endDate')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('monthsWorked')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('monthlyService')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('totalRevenue')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('status')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('source')}</th>
                </tr>
              </thead>
              <tbody>
                {wonLeads.map((lead) => {
                  const months = monthsBetween(lead.closedAt, lead.endDate);
                  const totalRevenue = (lead.monthlyValue || 0) * months + (lead.dealValue || 0);
                  const isActive = !lead.endDate || new Date(lead.endDate) > new Date();
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => openDetailModal(lead)}
                      className="cursor-pointer border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg"
                    >
                      <td className="px-4 py-3 font-medium text-brand-dark">{lead.name}</td>
                      <td className="px-4 py-3 text-brand-muted">{formatDate(lead.closedAt)}</td>
                      <td className="px-4 py-3 text-brand-muted">{formatDate(lead.endDate)}</td>
                      <td className="px-4 py-3 text-brand-dark">{months}</td>
                      <td className="px-4 py-3 text-brand-dark">
                        {lead.monthlyValue ? `₪ ${lead.monthlyValue.toLocaleString()}` : "\u2014"}
                      </td>
                      <td className="px-4 py-3 font-medium text-brand-success">
                        ₪ {totalRevenue.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-brand-success/20 text-brand-success" : "bg-gray-100 text-brand-muted"}`}>
                          {isActive ? t('active') : t('ended')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[lead.source] || SOURCE_COLORS.other}`}>
                          {getSourceLabel(lead.source)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {wonLeads.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-brand-muted">
                      {t('noResults')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════
         CHURNED TAB
         ════════════════════════════════════════ */}
      {subTab === "churned" && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('totalChurned')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-danger">{churnedKpi.total}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('avgMonthsClient')}</p>
              <p className="mt-1 text-2xl font-semibold text-brand-dark">{churnedKpi.avgMonths}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">{t('topChurnReason')}</p>
              <div className="mt-1 space-y-1">
                {churnedKpi.topReasons.length > 0 ? (
                  churnedKpi.topReasons.map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-sm">
                      <span className="text-brand-dark">{r.label}</span>
                      <span className="text-brand-muted">{r.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-brand-muted">\u2014</p>
                )}
              </div>
            </div>
          </div>

          {/* Churned Filter bar */}
          <button onClick={() => setChurnedFiltersOpen(!churnedFiltersOpen)} className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg"><Filter className="h-4 w-4" />{t('filter')}{churnedFilterCount > 0 && <span className="rounded-full bg-brand-gold px-2 py-0.5 text-xs font-bold text-brand-dark">{churnedFilterCount}</span>}</button>
          {churnedFiltersOpen && (
          <div className={`${cardClass} space-y-3`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="relative col-span-2 sm:col-span-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                <input
                  type="text"
                  placeholder={`${t('search')}...`}
                  value={churnedSearch}
                  onChange={(e) => setChurnedSearch(e.target.value)}
                  className={`${inputClass} pr-9`}
                />
              </div>
              <select value={churnedReasonFilter} onChange={(e) => setChurnedReasonFilter(e.target.value)} className={inputClass}>
                <option value="all">כל הסיבות</option>
                {CHURN_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <select value={churnedSource} onChange={(e) => setChurnedSource(e.target.value)} className={inputClass}>
                <option value="all">{t('source')}</option>
                {allSources.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <input type="date" value={churnedDateFrom} onChange={(e) => setChurnedDateFrom(e.target.value)} placeholder={t('date')} className={inputClass} />
              <input type="date" value={churnedDateTo} onChange={(e) => setChurnedDateTo(e.target.value)} placeholder={t('date')} className={inputClass} />
            </div>
            <div className="flex items-center">
              <button onClick={clearChurnedFilters} className={btnSecondary}>
                <span className="flex items-center gap-1">
                  <X className="h-3 w-3" />
                  {t('clearFilters')}
                </span>
              </button>
            </div>
          </div>
          )}

          {/* Table */}
          <div className={`${cardClass} overflow-x-auto p-0`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-bg text-brand-muted">
                  <th className="px-4 py-3 text-right font-medium">{t('name')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('churnDate')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('date')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('monthsWorked')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('churnReason')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('totalRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                {churnedLeads.map((lead) => {
                  const months = monthsBetween(lead.closedAt, lead.churnedAt);
                  const totalRevenue = (lead.monthlyValue || 0) * months + (lead.dealValue || 0);
                  const reasonLabel = CHURN_REASONS.find((r) => r.value === lead.churnReason)?.label || lead.churnReason || "\u2014";
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => openDetailModal(lead)}
                      className="cursor-pointer border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg"
                    >
                      <td className="px-4 py-3 font-medium text-brand-dark">{lead.name}</td>
                      <td className="px-4 py-3 text-brand-muted">{formatDate(lead.churnedAt)}</td>
                      <td className="px-4 py-3 text-brand-muted">{formatDate(lead.closedAt)}</td>
                      <td className="px-4 py-3 text-brand-dark">{months}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-brand-danger/20 px-2 py-0.5 text-xs font-medium text-brand-danger">
                          {reasonLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-brand-success">
                        ₪ {totalRevenue.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {churnedLeads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-brand-muted">
                      {t('noResults')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════
         NEW LEAD MODAL
         ════════════════════════════════════════ */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('newLead')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('name')} *</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} placeholder={t('name')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('company')}</label>
              <input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} className={inputClass} placeholder={t('company')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('email')}</label>
              <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className={inputClass} placeholder="email@example.com" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('phone')}</label>
              <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className={inputClass} placeholder="050-0000000" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('website')}</label>
              <input value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} className={inputClass} placeholder="https://..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">נכסים דיגיטליים</label>
              <input value={form.digitalAssets} onChange={(e) => setForm((p) => ({ ...p, digitalAssets: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('source')}</label>
              {newSourceMode ? (
                <div className="flex gap-2">
                  <input
                    value={newSourceInput}
                    onChange={(e) => setNewSourceInput(e.target.value)}
                    className={inputClass}
                    placeholder="שם מקור חדש..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomSource(newSourceInput, (v) => setForm((p) => ({ ...p, source: v as Lead["source"] })), () => { setNewSourceMode(false); setNewSourceInput(""); })}
                    className={btnPrimary}
                  >
                    הוסף
                  </button>
                  <button type="button" onClick={() => { setNewSourceMode(false); setNewSourceInput(""); }} className={btnSecondary}>X</button>
                </div>
              ) : (
                <select
                  value={form.source}
                  onChange={(e) => {
                    if (e.target.value === "__add_custom__") {
                      setNewSourceMode(true);
                      return;
                    }
                    setForm((p) => ({ ...p, source: e.target.value as Lead["source"] }));
                  }}
                  className={inputClass}
                >
                  {allSources.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                  <option value="__add_custom__">{t('addSource')}</option>
                </select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('status')}</label>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Lead["status"] }))} className={inputClass}>
                {KANBAN_COLUMNS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('value')}</label>
              <input type="number" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} className={inputClass} placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">תקציב משוער</label>
              <input value={form.estimatedBudget} onChange={(e) => setForm((p) => ({ ...p, estimatedBudget: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">איש מכירות</label>
              <select value={form.salesPerson} onChange={(e) => setForm((p) => ({ ...p, salesPerson: e.target.value }))} className={inputClass}>
                <option value="">בחר...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('dueDate')}</label>
              <input type="date" value={form.nextFollowUp} onChange={(e) => setForm((p) => ({ ...p, nextFollowUp: e.target.value }))} className={inputClass} />
            </div>
          </div>

          {/* Social */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Facebook Page</label>
              <input value={form.leadFacebookPage} onChange={(e) => setForm((p) => ({ ...p, leadFacebookPage: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Instagram</label>
              <input value={form.leadInstagram} onChange={(e) => setForm((p) => ({ ...p, leadInstagram: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">LinkedIn</label>
              <input value={form.leadLinkedin} onChange={(e) => setForm((p) => ({ ...p, leadLinkedin: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">TikTok</label>
              <input value={form.leadTiktok} onChange={(e) => setForm((p) => ({ ...p, leadTiktok: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Google Ads</label>
              <input value={form.leadGoogleAds} onChange={(e) => setForm((p) => ({ ...p, leadGoogleAds: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Meta Ads</label>
              <input value={form.leadMetaAds} onChange={(e) => setForm((p) => ({ ...p, leadMetaAds: e.target.value }))} className={inputClass} />
            </div>
          </div>

          {/* Services */}
          <div>
            <label className="mb-2 block text-xs font-medium text-brand-muted">{t('interestedServices')}</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INTERESTED_SERVICES.map((service) => (
                <label key={service} className="flex cursor-pointer items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs transition-colors duration-200 hover:bg-brand-bg">
                  <input
                    type="checkbox"
                    checked={form.interestedServices.includes(service)}
                    onChange={() => toggleService(service)}
                    className="h-4 w-4 rounded border-brand-border text-brand-gold accent-brand-gold"
                  />
                  <span className={form.interestedServices.includes(service) ? "font-medium text-brand-dark" : "text-brand-muted"}>{service}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">הערות</label>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className={`${inputClass} h-20`} placeholder="הערות..." />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className={btnSecondary}>{t('cancel')}</button>
            <button type="submit" className={btnPrimary}>{t('save')}</button>
          </div>
        </form>
      </Modal>

      {/* ════════════════════════════════════════
         LEAD DETAIL MODAL
         ════════════════════════════════════════ */}
      <Modal
        isOpen={!!selectedLead && !isEditModalOpen}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.name || "פרטי ליד"}
        size="lg"
      >
        {selectedLead && (
          <div className="space-y-6">
            {/* Header with edit button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium text-brand-light ${getStatusInfo(selectedLead.status).color}`}>
                  {getStatusInfo(selectedLead.status).label}
                </span>
                <StarRating value={selectedLead.qualityRating || 0} onChange={(v) => {
                  handleQualityChange(selectedLead.id, v);
                  setSelectedLead((p) => p ? { ...p, qualityRating: v } : null);
                }} />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDeleteLead(selectedLead.id)} className="flex items-center gap-1 rounded-lg border border-brand-danger px-2.5 py-1 text-xs text-brand-danger hover:bg-red-50">
                  <Trash2 className="h-3 w-3" />
                  {t('delete')}
                </button>
                <button onClick={() => openEditModal(selectedLead)} className={btnPrimary}>
                  <span className="flex items-center gap-1">
                    <Pencil className="h-3 w-3" />
                    {t('edit')}
                  </span>
                </button>
              </div>
            </div>

            {/* === הצעד הבא — האלמנט הכי חשוב בכרטיס === */}
            {OPEN_STATUSES.includes(selectedLead.status) && (
              <div className={`rounded-lg border p-4 ${!selectedLead.nextFollowUp ? "border-brand-danger bg-brand-danger/5" : "border-brand-gold/50 bg-brand-gold/5"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-brand-dark">🎯 הצעד הבא</p>
                  {(() => { const c = nextActionChip(selectedLead); return c ? <span className={`rounded-full px-2 py-0.5 text-[10px] ${c.cls}`}>{c.text}</span> : null; })()}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select
                    value={selectedLead.nextActionType || ""}
                    onChange={async (e) => {
                      const v = e.target.value;
                      setSelectedLead((p) => p ? { ...p, nextActionType: v } : null);
                      await updateLead(selectedLead.id, { nextActionType: v } as Partial<Lead>);
                    }}
                    className={inputClass}
                  >
                    <option value="">סוג צעד...</option>
                    <option value="call">📞 שיחה</option>
                    <option value="meeting">🤝 פגישה</option>
                    <option value="followup">🔄 פולו-אפ</option>
                    <option value="proposal">📄 הצעת מחיר</option>
                    <option value="other">✏️ אחר</option>
                  </select>
                  <input
                    type="date"
                    value={selectedLead.nextFollowUp || ""}
                    onChange={async (e) => {
                      const v = e.target.value;
                      setSelectedLead((p) => p ? { ...p, nextFollowUp: v } : null);
                      await updateLead(selectedLead.id, { nextFollowUp: v } as Partial<Lead>);
                    }}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={selectedLead.nextActionNote || ""}
                    onChange={(e) => setSelectedLead((p) => p ? { ...p, nextActionNote: e.target.value } : null)}
                    onBlur={async (e) => { await updateLead(selectedLead.id, { nextActionNote: e.target.value } as Partial<Lead>); }}
                    className={inputClass}
                    placeholder="מה בדיוק? (למשל: לוודא שקיבל את ההצעה)"
                  />
                </div>
                {!selectedLead.nextFollowUp && (
                  <p className="mt-2 text-xs font-medium text-brand-danger">⚠ ליד פתוח בלי צעד הבא מתוזמן — קבע עכשיו כדי שלא יפול בין הכיסאות</p>
                )}
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4">
              {selectedLead.company && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand-muted" />
                  <span className="text-sm text-brand-dark">{selectedLead.company}</span>
                </div>
              )}
              {selectedLead.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-brand-muted" />
                  <a href={`tel:${selectedLead.phone}`} className="text-sm text-brand-info hover:underline">{selectedLead.phone}</a>
                </div>
              )}
              {selectedLead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-brand-muted" />
                  <a href={`mailto:${selectedLead.email}`} className="text-sm text-brand-info hover:underline">{selectedLead.email}</a>
                </div>
              )}
              {selectedLead.website && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-muted" />
                  <a href={selectedLead.website} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-info hover:underline">{selectedLead.website}</a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-brand-muted" />
                <span className="text-sm text-brand-muted">נוצר: {formatDate(selectedLead.createdAt)}</span>
              </div>
              <div>
                <span className="text-xs text-brand-muted">{t('source')}: </span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[selectedLead.source] || SOURCE_COLORS.other}`}>
                  {getSourceLabel(selectedLead.source)}
                </span>
              </div>
              {(selectedLead.dealValue > 0 || selectedLead.value > 0) && (
                <div>
                  <span className="text-xs text-brand-muted">שווי עסקה: </span>
                  <span className="text-sm font-medium text-brand-success">₪ {(selectedLead.dealValue || selectedLead.value).toLocaleString()}</span>
                </div>
              )}
              {selectedLead.monthlyValue > 0 && (
                <div>
                  <span className="text-xs text-brand-muted">שירות חודשי: </span>
                  <span className="text-sm font-medium text-brand-dark">₪ {selectedLead.monthlyValue.toLocaleString()}</span>
                </div>
              )}
              {selectedLead.estimatedBudget && (
                <div>
                  <span className="text-xs text-brand-muted">תקציב משוער: </span>
                  <span className="text-sm text-brand-dark">{selectedLead.estimatedBudget}</span>
                </div>
              )}
              {selectedLead.salesPerson && (
                <div>
                  <span className="text-xs text-brand-muted">איש מכירות: </span>
                  <span className="text-sm text-brand-dark">{selectedLead.salesPerson}</span>
                </div>
              )}
            </div>

            {/* Services */}
            {selectedLead.interestedServices?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-brand-muted">{t('interestedServices')}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedLead.interestedServices.map((s) => (
                    <span key={s} className="rounded-full bg-brand-gold/20 px-3 py-1 text-xs font-medium text-brand-dark">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedLead.notes && (
              <div>
                <p className="mb-1 text-xs font-medium text-brand-muted">הערות</p>
                <p className="rounded-lg bg-brand-bg p-3 text-sm text-brand-dark">{selectedLead.notes}</p>
              </div>
            )}

            {/* Proposal details */}
            {selectedLead.proposalDetails && (
              <div>
                <p className="mb-1 text-xs font-medium text-brand-muted">{t('proposalDetails')}</p>
                <p className="rounded-lg bg-brand-bg p-3 text-sm text-brand-dark whitespace-pre-wrap">{selectedLead.proposalDetails}</p>
              </div>
            )}

            {/* Status change */}
            <div>
              <p className="mb-2 text-xs font-medium text-brand-muted">שנה סטטוס</p>
              <div className="flex flex-wrap gap-2">
                {LEAD_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => handleStatusChange(s.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ${
                      selectedLead.status === s.value
                        ? `${s.color} text-brand-light`
                        : "bg-brand-bg text-brand-muted hover:bg-brand-border"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Proposal */}
            <div className="rounded-lg border border-brand-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-brand-dark">הצעת מחיר</p>
                <button onClick={handleProposalToggle} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ${selectedLead.hasProposal ? "bg-brand-success/20 text-brand-success" : "bg-brand-bg text-brand-muted"}`}>
                  {selectedLead.hasProposal ? "נשלחה ✓" : "לא נשלחה"}
                </button>
              </div>
              {selectedLead.hasProposal && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-brand-muted">תאריך שליחה</label>
                    <input type="date" value={selectedLead.proposalDate || ""} onChange={(e) => handleProposalDateChange(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-brand-muted">שם קובץ</label>
                    <input value={selectedLead.proposalFileName || ""} onChange={(e) => handleProposalFileChange(e.target.value)} className={inputClass} placeholder="proposal.pdf" />
                  </div>
                </div>
              )}
              {/* === הצעת מחיר === */}
              <div className="mt-4 rounded-lg border border-brand-border bg-brand-bg/50 p-4">
                <p className="mb-3 text-sm font-semibold text-brand-dark">הצעת מחיר</p>
                {selectedLead.proposalUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-lg bg-brand-light p-3 border border-brand-border">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                        <FileText className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-dark truncate">{selectedLead.proposalFileName || "הצעת מחיר.pdf"}</p>
                        <p className="text-xs text-brand-muted">PDF</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setProposalViewOpen(true)}
                          className="rounded-lg p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
                          title="צפה"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <a
                          href={proposalFileUrl(selectedLead.proposalUrl, true)}
                          download
                          className="rounded-lg p-2 text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
                          title="הורד"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                        <button
                          onClick={handleDeleteProposal}
                          className="rounded-lg p-2 text-brand-muted hover:bg-red-50 hover:text-brand-danger"
                          title="מחק"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-brand-gold hover:underline">
                      <input type="file" accept=".pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadProposal(e.target.files[0]); }} />
                      החלף הצעה
                    </label>
                  </div>
                ) : (
                  <label
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-brand-border p-6 text-center transition-colors hover:border-brand-gold hover:bg-brand-gold/5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f && f.type === "application/pdf") handleUploadProposal(f); }}
                  >
                    {uploading ? (
                      <>
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
                        <span className="text-sm font-medium text-brand-dark">מעלה... {uploadProgress}%</span>
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-brand-border">
                          <div className="h-full rounded-full bg-brand-gold transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <FileText className="h-8 w-8 text-brand-muted" />
                        <span className="text-sm font-medium text-brand-dark">העלה הצעת מחיר</span>
                        <span className="text-xs text-brand-muted">גרור PDF לכאן או לחץ לבחירה</span>
                      </>
                    )}
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadProposal(e.target.files[0]); }} />
                  </label>
                )}
              </div>
            </div>

            {/* Internal notes */}
            <div>
              <p className="mb-2 text-xs font-medium text-brand-muted">הערות פנימיות</p>
              <textarea
                value={internalNotesLocal}
                onChange={(e) => setInternalNotesLocal(e.target.value)}
                className={`${inputClass} h-20`}
                placeholder="הערות פנימיות..."
              />
              <button onClick={handleSaveInternalNotes} className={`${btnPrimary} mt-2`}>
                {t('save')}
              </button>
            </div>

            {/* Calls history */}
            <div>
              <p className="mb-2 text-sm font-medium text-brand-dark">
                <PhoneCall className="ml-1 inline h-4 w-4" />
                היסטוריית שיחות ({selectedLead.calls?.length || 0})
              </p>
              {selectedLead.calls?.length > 0 && (
                <div className="mb-3 max-h-40 space-y-2 overflow-y-auto">
                  {[...selectedLead.calls].reverse().map((call) => (
                    <div key={call.id} className="rounded-lg bg-brand-bg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-brand-dark">{call.caller || "לא ידוע"}</span>
                        <span className="text-xs text-brand-muted">{formatDate(call.date)}</span>
                      </div>
                      <p className="mt-1 text-sm text-brand-dark">{call.summary}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add call */}
              <div className="rounded-lg border border-brand-border p-3">
                <p className="mb-2 text-xs font-medium text-brand-muted">הוסף שיחה</p>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={callForm.date} onChange={(e) => setCallForm((p) => ({ ...p, date: e.target.value }))} className={inputClass} />
                  <select value={callForm.caller} onChange={(e) => setCallForm((p) => ({ ...p, caller: e.target.value }))} className={inputClass}>
                    <option value="">מתקשר...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.name}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={callForm.summary}
                  onChange={(e) => setCallForm((p) => ({ ...p, summary: e.target.value }))}
                  className={`${inputClass} mt-2 h-16`}
                  placeholder="תקציר השיחה..."
                />
                <button onClick={handleAddCall} className={`${btnPrimary} mt-2`}>
                  <span className="flex items-center gap-1">
                    <Plus className="h-3 w-3" />
                    הוסף שיחה
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ════════════════════════════════════════
         EDIT LEAD MODAL
         ════════════════════════════════════════ */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('edit')}
        size="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('name')}</label>
              <input value={editForm.name || ""} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('company')}</label>
              <input value={editForm.company || ""} onChange={(e) => setEditForm((p) => ({ ...p, company: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('email')}</label>
              <input type="email" value={editForm.email || ""} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('phone')}</label>
              <input value={editForm.phone || ""} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('website')}</label>
              <input value={editForm.website || ""} onChange={(e) => setEditForm((p) => ({ ...p, website: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">נכסים דיגיטליים</label>
              <input value={editForm.digitalAssets || ""} onChange={(e) => setEditForm((p) => ({ ...p, digitalAssets: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('source')}</label>
              {editNewSourceMode ? (
                <div className="flex gap-2">
                  <input
                    value={editNewSourceInput}
                    onChange={(e) => setEditNewSourceInput(e.target.value)}
                    className={inputClass}
                    placeholder="שם מקור חדש..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCustomSource(editNewSourceInput, (v) => setEditForm((p) => ({ ...p, source: v as Lead["source"] })), () => { setEditNewSourceMode(false); setEditNewSourceInput(""); })}
                    className={btnPrimary}
                  >
                    הוסף
                  </button>
                  <button type="button" onClick={() => { setEditNewSourceMode(false); setEditNewSourceInput(""); }} className={btnSecondary}>X</button>
                </div>
              ) : (
                <select
                  value={editForm.source || "other"}
                  onChange={(e) => {
                    if (e.target.value === "__add_custom__") {
                      setEditNewSourceMode(true);
                      return;
                    }
                    setEditForm((p) => ({ ...p, source: e.target.value as Lead["source"] }));
                  }}
                  className={inputClass}
                >
                  {allSources.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                  <option value="__add_custom__">{t('addSource')}</option>
                </select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('status')}</label>
              <select value={editForm.status || "new"} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as Lead["status"] }))} className={inputClass}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('value')}</label>
              <input type="number" value={editForm.value || 0} onChange={(e) => setEditForm((p) => ({ ...p, value: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">שווי דיל</label>
              <input type="number" value={editForm.dealValue || 0} onChange={(e) => setEditForm((p) => ({ ...p, dealValue: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('monthlyService')}</label>
              <input type="number" value={editForm.monthlyValue || 0} onChange={(e) => setEditForm((p) => ({ ...p, monthlyValue: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">סוג שירות</label>
              <input value={editForm.serviceType || ""} onChange={(e) => setEditForm((p) => ({ ...p, serviceType: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">תקציב משוער</label>
              <input value={editForm.estimatedBudget || ""} onChange={(e) => setEditForm((p) => ({ ...p, estimatedBudget: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">איש מכירות</label>
              <select value={editForm.salesPerson || ""} onChange={(e) => setEditForm((p) => ({ ...p, salesPerson: e.target.value }))} className={inputClass}>
                <option value="">בחר...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('dueDate')}</label>
              <input type="date" value={editForm.nextFollowUp || ""} onChange={(e) => setEditForm((p) => ({ ...p, nextFollowUp: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">דירוג איכות</label>
              <StarRating value={editForm.qualityRating || 0} onChange={(v) => setEditForm((p) => ({ ...p, qualityRating: v }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('closingDate')}</label>
              <input type="date" value={editForm.closedAt || ""} onChange={(e) => setEditForm((p) => ({ ...p, closedAt: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">{t('endDate')}</label>
              <input type="date" value={editForm.endDate || ""} onChange={(e) => setEditForm((p) => ({ ...p, endDate: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">URL הצעה</label>
              <input value={editForm.proposalUrl || ""} onChange={(e) => setEditForm((p) => ({ ...p, proposalUrl: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">תאריך הצעה</label>
              <input type="date" value={editForm.proposalDate || ""} onChange={(e) => setEditForm((p) => ({ ...p, proposalDate: e.target.value }))} className={inputClass} />
            </div>
          </div>

          {/* Social fields */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Facebook Page</label>
              <input value={editForm.leadFacebookPage || ""} onChange={(e) => setEditForm((p) => ({ ...p, leadFacebookPage: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Instagram</label>
              <input value={editForm.leadInstagram || ""} onChange={(e) => setEditForm((p) => ({ ...p, leadInstagram: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">LinkedIn</label>
              <input value={editForm.leadLinkedin || ""} onChange={(e) => setEditForm((p) => ({ ...p, leadLinkedin: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">TikTok</label>
              <input value={editForm.leadTiktok || ""} onChange={(e) => setEditForm((p) => ({ ...p, leadTiktok: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Google Ads</label>
              <input value={editForm.leadGoogleAds || ""} onChange={(e) => setEditForm((p) => ({ ...p, leadGoogleAds: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">Meta Ads</label>
              <input value={editForm.leadMetaAds || ""} onChange={(e) => setEditForm((p) => ({ ...p, leadMetaAds: e.target.value }))} className={inputClass} />
            </div>
          </div>

          {/* Services */}
          <div>
            <label className="mb-2 block text-xs font-medium text-brand-muted">{t('interestedServices')}</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INTERESTED_SERVICES.map((service) => (
                <label key={service} className="flex cursor-pointer items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs transition-colors duration-200 hover:bg-brand-bg">
                  <input
                    type="checkbox"
                    checked={(editForm.interestedServices || []).includes(service)}
                    onChange={() => toggleEditService(service)}
                    className="h-4 w-4 rounded border-brand-border text-brand-gold accent-brand-gold"
                  />
                  <span className={(editForm.interestedServices || []).includes(service) ? "font-medium text-brand-dark" : "text-brand-muted"}>{service}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">הערות</label>
            <textarea value={editForm.notes || ""} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} className={`${inputClass} h-20`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">הערות פנימיות</label>
            <textarea value={editForm.internalNotes || ""} onChange={(e) => setEditForm((p) => ({ ...p, internalNotes: e.target.value }))} className={`${inputClass} h-20`} />
          </div>

          {/* Proposal details */}
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">{t('proposalDetails')}</label>
            <textarea value={editForm.proposalDetails || ""} onChange={(e) => setEditForm((p) => ({ ...p, proposalDetails: e.target.value }))} className={`${inputClass} h-20`} placeholder="פרטים על השיחה וההצעה שהוגשה..." />
          </div>

          {/* Churn fields (if churned) */}
          {editForm.status === "churned" && (
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-brand-danger/30 bg-brand-danger/5 p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-danger">{t('churnDate')}</label>
                <input type="date" value={editForm.churnedAt || ""} onChange={(e) => setEditForm((p) => ({ ...p, churnedAt: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-danger">{t('churnReason')}</label>
                <select value={editForm.churnReason || ""} onChange={(e) => setEditForm((p) => ({ ...p, churnReason: e.target.value }))} className={inputClass}>
                  <option value="">בחר...</option>
                  {CHURN_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-brand-danger">פרטים נוספים</label>
                <textarea value={editForm.churnDetails || ""} onChange={(e) => setEditForm((p) => ({ ...p, churnDetails: e.target.value }))} className={`${inputClass} h-16`} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => { if (selectedLead) handleDeleteLead(selectedLead.id); setIsEditModalOpen(false); }} className="flex items-center gap-1 rounded-lg border border-brand-danger px-2.5 py-1 text-xs text-brand-danger hover:bg-red-50">
              <Trash2 className="h-3 w-3" />
              {t('delete')}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className={btnSecondary}>{t('cancel')}</button>
              <button type="submit" className={btnPrimary}>{t('save')}</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ════════════════════════════════════════
         CHURN MODAL
         ════════════════════════════════════════ */}
      <Modal
        isOpen={isChurnModalOpen}
        onClose={() => {
          if (!churnForm.churnReason) {
            alert("יש למלא סיבת עזיבה לפני סגירת החלון");
            return;
          }
          handleChurnSubmit();
        }}
        title="סימון לקוח כנוטש"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            האם לסמן את <span className="font-medium text-brand-dark">{churnTarget?.name}</span> כלקוח נוטש?
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">{t('churnDate')} *</label>
            <input
              type="date"
              value={churnForm.churnedAt}
              onChange={(e) => setChurnForm((p) => ({ ...p, churnedAt: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">{t('churnReason')} *</label>
            <select
              value={churnForm.churnReason}
              onChange={(e) => setChurnForm((p) => ({ ...p, churnReason: e.target.value }))}
              className={inputClass}
            >
              <option value="">בחר סיבה...</option>
              {CHURN_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">פרטים נוספים</label>
            <textarea
              value={churnForm.churnDetails}
              onChange={(e) => setChurnForm((p) => ({ ...p, churnDetails: e.target.value }))}
              className={`${inputClass} h-20`}
              placeholder="פרטים נוספים על סיבת העזיבה..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                if (!churnForm.churnReason) {
                  alert("יש למלא סיבת עזיבה לפני סגירת החלון");
                  return;
                }
                handleChurnSubmit();
              }}
              className={btnSecondary}
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleChurnSubmit}
              disabled={!churnForm.churnedAt || !churnForm.churnReason}
              className={`${btnPrimary} disabled:opacity-50 disabled:cursor-not-allowed bg-brand-danger hover:bg-brand-danger/80`}
            >
              אשר נטישה
            </button>
          </div>
        </div>
      </Modal>

      {/* PDF Viewer Modal */}
      <Modal isOpen={proposalViewOpen} onClose={() => setProposalViewOpen(false)} title={selectedLead?.proposalFileName || "הצעת מחיר"} size="lg">
        {selectedLead?.proposalUrl && (
          <div className="space-y-3">
            <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-brand-border">
              <iframe
                src={proposalFileUrl(selectedLead.proposalUrl)}
                className="h-full w-full"
                title="PDF Viewer"
              />
            </div>
            <div className="flex justify-end gap-3">
              <a
                href={proposalFileUrl(selectedLead.proposalUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg"
              >
                פתח בטאב חדש
              </a>
              <a
                href={proposalFileUrl(selectedLead.proposalUrl, true)}
                download={selectedLead.proposalFileName}
                className={btnPrimary}
              >
                הורד
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
