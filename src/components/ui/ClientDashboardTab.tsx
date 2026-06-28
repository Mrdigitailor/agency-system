"use client";

import { useState, useEffect, useCallback } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Pencil, Trash2, GripVertical, Loader2, Link2, Copy, ExternalLink, Eye, ArrowRight, FileText, Share2, ChevronLeft } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { WidgetGrid, type WidgetDTO } from "@/components/dashboard/DashboardWidgets";
import { getMetricsForPlatform, PLATFORM_LABELS, DISPLAY_LABELS, DIMENSION_LABELS, validDimensions, type Platform, type DisplayType, type Dimension } from "@/lib/dashboard/metrics";

interface Widget {
  id: string;
  platform: Platform;
  metrics: string[];
  displayType: DisplayType;
  dimension: string;
  size: string;
  title: string;
  textBody: string;
  compare: boolean;
}

const PLATFORMS: Platform[] = ["meta", "google_ads", "tiktok", "all", "ga4"];
const DISPLAYS: DisplayType[] = ["kpi", "line", "area", "bar", "pie", "table", "heading", "text"];
const isTextType = (d: DisplayType) => d === "heading" || d === "text";
const emptyForm = (): Widget => ({ id: "", platform: "meta", metrics: [], displayType: "kpi", dimension: "none", size: "full", title: "", textBody: "", compare: false });
const SIZES = [
  { v: "full", label: "מלא" },
  { v: "half", label: "חצי" },
  { v: "third", label: "שליש" },
];
const cardClass = "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";
const inputClass = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm focus:border-brand-gold focus:outline-none";

function SortableRow({ w, onEdit, onDelete }: { w: Widget; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-bg p-3">
      <button {...attributes} {...listeners} className="cursor-grab text-brand-muted hover:text-brand-dark"><GripVertical className="h-4 w-4" /></button>
      <div className="flex-1">
        <p className="text-sm font-medium text-brand-dark">{w.title || "(ללא כותרת)"}</p>
        <p className="text-xs text-brand-muted">{PLATFORM_LABELS[w.platform]} · {DISPLAY_LABELS[w.displayType]} · {w.metrics.length} מדדים</p>
      </div>
      <button onClick={onEdit} className="rounded p-1.5 text-brand-muted hover:bg-brand-light hover:text-brand-dark"><Pencil className="h-4 w-4" /></button>
      <button onClick={onDelete} className="rounded p-1.5 text-brand-muted hover:bg-red-50 hover:text-brand-danger"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

function ReportEditor({ clientId, reportId, reportName, onBack }: { clientId: string; reportId: string; reportName: string; onBack: () => void }) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [preview, setPreview] = useState<{ widgets: WidgetDTO[]; client: { currency: string } } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [share, setShare] = useState<{ enabled: boolean; token: string | null }>({ enabled: false, token: null });
  const [copied, setCopied] = useState(false);

  // modal
  const [editing, setEditing] = useState<Widget | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Widget>(emptyForm());
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadWidgets = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/widgets?reportId=${reportId}`);
    if (res.ok) setWidgets(await res.json());
  }, [clientId, reportId]);

  const loadShare = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/reports/${reportId}/public`);
    if (res.ok) setShare(await res.json());
  }, [clientId, reportId]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dashboard-preview?reportId=${reportId}`);
      if (res.ok) setPreview(await res.json());
    } finally {
      setPreviewLoading(false);
    }
  }, [clientId, reportId]);

  useEffect(() => { loadWidgets(); loadShare(); loadPreview(); }, [loadWidgets, loadShare, loadPreview]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  // שינוי סוג תצוגה — מתאים את הפילוח לברירת מחדל חוקית
  function setDisplay(displayType: DisplayType) {
    setForm((f) => {
      const dims = validDimensions(displayType, f.platform);
      const dimension = dims.includes(f.dimension as Dimension) ? f.dimension : dims[0];
      return { ...f, displayType, dimension };
    });
  }
  function openEdit(w: Widget) {
    setEditing(w);
    setForm({ ...w });
    setOpen(true);
  }

  function setPlatform(platform: Platform) {
    const valid = getMetricsForPlatform(platform).map((m) => m.id);
    setForm((f) => {
      const dims = validDimensions(f.displayType, platform);
      const dimension = dims.includes(f.dimension as Dimension) ? f.dimension : dims[0];
      return { ...f, platform, metrics: f.metrics.filter((m) => valid.includes(m)), dimension };
    });
  }
  function toggleMetric(id: string) {
    setForm((f) => ({ ...f, metrics: f.metrics.includes(id) ? f.metrics.filter((m) => m !== id) : [...f.metrics, id] }));
  }

  async function saveWidget() {
    const isText = isTextType(form.displayType);
    if (!isText && form.metrics.length === 0) return;
    if (isText && !form.title.trim() && !form.textBody.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await fetch(`/api/clients/${clientId}/widgets`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: editing.id }) });
      } else {
        await fetch(`/api/clients/${clientId}/widgets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, reportId }) });
      }
      setOpen(false);
      await loadWidgets();
      await loadPreview();
    } finally {
      setSaving(false);
    }
  }

  async function deleteWidget(id: string) {
    if (!confirm("למחוק את הווידג'ט?")) return;
    await fetch(`/api/clients/${clientId}/widgets?widgetId=${id}`, { method: "DELETE" });
    await loadWidgets();
    await loadPreview();
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = widgets.findIndex((w) => w.id === active.id);
    const newI = widgets.findIndex((w) => w.id === over.id);
    const next = arrayMove(widgets, oldI, newI);
    setWidgets(next);
    await fetch(`/api/clients/${clientId}/widgets`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next.map((w) => w.id) }) });
    await loadPreview();
  }

  async function toggleShare(enable: boolean) {
    const res = await fetch(`/api/clients/${clientId}/reports/${reportId}/public`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: enable ? "generate" : "disable" }) });
    if (res.ok) await loadShare();
  }

  const shareUrl = share.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${share.token}` : "";

  return (
    <div className="space-y-6">
      {/* כותרת דוח + חזרה לרשימה */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-sm text-brand-muted hover:bg-brand-bg"><ArrowRight className="h-4 w-4" />כל הדוחות</button>
        <h2 className="text-lg font-semibold text-brand-dark">{reportName}</h2>
      </div>

      {/* שיתוף */}
      <div className={`${cardClass} border-brand-gold/30 bg-brand-gold/5`}>
        <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-brand-gold" /><h3 className="text-sm font-semibold text-brand-dark">קישור ציבורי ללקוח</h3></div>
        {share.enabled && share.token ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <input readOnly value={shareUrl} className={`${inputClass} font-mono text-xs`} dir="ltr" />
              <button onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-border px-3 py-2 text-xs hover:bg-brand-bg"><Copy className="h-3.5 w-3.5" />{copied ? "הועתק" : "העתק"}</button>
              <a href={shareUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-border px-3 py-2 text-xs hover:bg-brand-bg"><ExternalLink className="h-3.5 w-3.5" />פתח</a>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleShare(true)} className="text-xs text-brand-muted hover:text-brand-dark">סבב קישור</button>
              <span className="text-brand-border">·</span>
              <button onClick={() => toggleShare(false)} className="text-xs text-brand-danger hover:underline">בטל קישור</button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="mb-2 text-xs text-brand-muted">צור קישור חי שניתן לשלוח ללקוח — בלי התחברות.</p>
            <button onClick={() => toggleShare(true)} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80">צור קישור</button>
          </div>
        )}
      </div>

      {/* ניהול ווידג'טים */}
      <div className={cardClass}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-dark">ווידג'טים</h3>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80"><Plus className="h-3.5 w-3.5" />הוסף ווידג'ט</button>
        </div>
        {widgets.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-muted">אין ווידג'טים. הוסף את הראשון.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {widgets.map((w) => <SortableRow key={w.id} w={w} onEdit={() => openEdit(w)} onDelete={() => deleteWidget(w.id)} />)}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* תצוגה מקדימה */}
      <div>
        <div className="mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-brand-gold" /><h3 className="text-sm font-semibold text-brand-dark">תצוגה מקדימה (כפי שהלקוח יראה)</h3>{previewLoading && <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />}</div>
        {preview ? <WidgetGrid widgets={preview.widgets} currency={preview.client.currency} /> : <p className="text-sm text-brand-muted">טוען...</p>}
      </div>

      {/* מודל ווידג'ט */}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? "עריכת ווידג'ט" : "ווידג'ט חדש"} size="lg">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">כותרת</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="לדוגמה: הוצאה והמרות" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">סוג תצוגה</label>
              <select value={form.displayType} onChange={(e) => setDisplay(e.target.value as DisplayType)} className={inputClass}>
                {DISPLAYS.map((d) => <option key={d} value={d}>{DISPLAY_LABELS[d]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">גודל</label>
              <select value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} className={inputClass}>
                {SIZES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {isTextType(form.displayType) ? (
            form.displayType === "text" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-muted">תוכן הטקסט</label>
                <textarea value={form.textBody} onChange={(e) => setForm((f) => ({ ...f, textBody: e.target.value }))} rows={4} dir="rtl" className={inputClass} placeholder="טקסט חופשי שיוצג ללקוח..." />
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-muted">פלטפורמה</label>
                  <select value={form.platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={inputClass}>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-muted">פילוח</label>
                  <select value={form.dimension} onChange={(e) => setForm((f) => ({ ...f, dimension: e.target.value }))} className={inputClass}>
                    {validDimensions(form.displayType, form.platform).map((d) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-muted">מדדים</label>
                <div className="flex flex-wrap gap-2">
                  {getMetricsForPlatform(form.platform).map((m) => (
                    <button key={m.id} type="button" onClick={() => toggleMetric(m.id)} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${form.metrics.includes(m.id) ? "border-brand-gold bg-brand-gold/15 text-brand-dark" : "border-brand-border bg-brand-bg text-brand-muted hover:bg-brand-light"}`}>{m.label}</button>
                  ))}
                </div>
              </div>
              {form.displayType === "kpi" && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-dark">
                  <input type="checkbox" checked={form.compare} onChange={(e) => setForm((f) => ({ ...f, compare: e.target.checked }))} className="h-4 w-4 rounded border-brand-border" />
                  השוואה לתקופה הקודמת (אחוז שינוי + חץ)
                </label>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 border-t border-brand-border pt-4">
            <button onClick={() => setOpen(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">ביטול</button>
            <button onClick={saveWidget} disabled={saving || (!isTextType(form.displayType) && form.metrics.length === 0)} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">{saving ? "שומר..." : "שמור"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ==================== רשימת דוחות (מסך כניסה) ====================

interface ReportRow {
  id: string;
  name: string;
  publicEnabled: boolean;
  publicToken: string | null;
  widgetCount: number;
  createdAt: string;
}

export default function ClientDashboardTab({ clientId }: { clientId: string }) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/reports`);
      if (res.ok) setReports(await res.json());
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function createReport() {
    const name = prompt("שם הדוח:", "דוח חדש");
    if (name === null) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || "דוח חדש" }) });
      if (res.ok) { const r = await res.json(); await load(); setOpenId(r.id); }
    } finally {
      setCreating(false);
    }
  }

  async function renameReport(r: ReportRow) {
    const name = prompt("שם הדוח:", r.name);
    if (name === null || !name.trim() || name === r.name) return;
    await fetch(`/api/clients/${clientId}/reports/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    await load();
  }

  async function deleteReport(r: ReportRow) {
    if (!confirm(`למחוק את הדוח "${r.name}" וכל הווידג'טים שבו?`)) return;
    await fetch(`/api/clients/${clientId}/reports/${r.id}`, { method: "DELETE" });
    await load();
  }

  if (openId) {
    const r = reports.find((x) => x.id === openId);
    return <ReportEditor clientId={clientId} reportId={openId} reportName={r?.name ?? "דוח"} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-dark">דוחות הלקוח</h2>
          <p className="text-sm text-brand-muted">צור כמה דוחות — כללי, קריאייטיבים, פר-פלטפורמה — לכל אחד קישור שיתוף נפרד.</p>
        </div>
        <button onClick={createReport} disabled={creating} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark/90 disabled:opacity-50"><Plus className="h-4 w-4" />דוח חדש</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-brand-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : reports.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <FileText className="mx-auto h-8 w-8 text-brand-muted" />
          <p className="mt-2 text-sm text-brand-muted">אין דוחות עדיין.</p>
          <button onClick={createReport} className="mt-3 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80">צור דוח ראשון</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border bg-brand-bg text-xs text-brand-muted">
              <tr>
                <th className="px-4 py-3 text-right font-medium">שם הדוח</th>
                <th className="px-4 py-3 text-right font-medium">ווידג'טים</th>
                <th className="px-4 py-3 text-right font-medium">שיתוף</th>
                <th className="px-4 py-3 text-right font-medium">נוצר</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-brand-border last:border-0 hover:bg-brand-bg/50">
                  <td className="px-4 py-3">
                    <button onClick={() => setOpenId(r.id)} className="flex items-center gap-2 font-medium text-brand-dark hover:text-brand-gold">
                      <FileText className="h-4 w-4 text-brand-muted" />{r.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-brand-muted">{r.widgetCount}</td>
                  <td className="px-4 py-3">
                    {r.publicEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-xs font-medium text-brand-success"><Share2 className="h-3 w-3" />משותף</span>
                    ) : (
                      <span className="text-xs text-brand-muted">לא משותף</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-muted">{new Date(r.createdAt).toLocaleDateString("he-IL")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => renameReport(r)} title="שנה שם" className="rounded p-1.5 text-brand-muted hover:bg-brand-bg hover:text-brand-dark"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => deleteReport(r)} title="מחק" className="rounded p-1.5 text-brand-muted hover:bg-red-50 hover:text-brand-danger"><Trash2 className="h-4 w-4" /></button>
                      <button onClick={() => setOpenId(r.id)} title="ערוך" className="rounded p-1.5 text-brand-muted hover:bg-brand-bg hover:text-brand-dark"><ChevronLeft className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
