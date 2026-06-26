"use client";

import { useState, useEffect, useCallback } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Pencil, Trash2, GripVertical, Loader2, Link2, Copy, ExternalLink, Eye } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { WidgetGrid, type WidgetDTO } from "@/components/dashboard/DashboardWidgets";
import { getMetricsForPlatform, PLATFORM_LABELS, DISPLAY_LABELS, type Platform, type DisplayType } from "@/lib/dashboard/metrics";

interface Widget {
  id: string;
  platform: Platform;
  metrics: string[];
  displayType: DisplayType;
  dimension: string;
  size: string;
  title: string;
}

const PLATFORMS: Platform[] = ["meta", "google_ads", "tiktok", "all", "ga4"];
const DISPLAYS: DisplayType[] = ["kpi", "line", "area", "bar", "pie", "table"];
const SIZES = [
  { v: "full", label: "מלא" },
  { v: "half", label: "חצי" },
  { v: "third", label: "שליש" },
];
const cardClass = "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";
const inputClass = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm focus:border-brand-gold focus:outline-none";

function autoDimension(displayType: DisplayType): string {
  if (displayType === "kpi") return "none";
  if (displayType === "table") return "campaign";
  if (displayType === "pie") return "platform";
  return "date";
}

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

export default function ClientDashboardTab({ clientId }: { clientId: string }) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [preview, setPreview] = useState<{ widgets: WidgetDTO[]; client: { currency: string } } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [share, setShare] = useState<{ enabled: boolean; token: string | null }>({ enabled: false, token: null });
  const [copied, setCopied] = useState(false);

  // modal
  const [editing, setEditing] = useState<Widget | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Widget>({ id: "", platform: "meta", metrics: [], displayType: "kpi", dimension: "none", size: "full", title: "" });
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadWidgets = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/widgets`);
    if (res.ok) setWidgets(await res.json());
  }, [clientId]);

  const loadShare = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/public-dashboard`);
    if (res.ok) setShare(await res.json());
  }, [clientId]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dashboard-preview`);
      if (res.ok) setPreview(await res.json());
    } finally {
      setPreviewLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadWidgets(); loadShare(); loadPreview(); }, [loadWidgets, loadShare, loadPreview]);

  function openNew() {
    setEditing(null);
    setForm({ id: "", platform: "meta", metrics: [], displayType: "kpi", dimension: "none", size: "full", title: "" });
    setOpen(true);
  }
  function openEdit(w: Widget) {
    setEditing(w);
    setForm({ ...w });
    setOpen(true);
  }

  function setPlatform(platform: Platform) {
    const valid = getMetricsForPlatform(platform).map((m) => m.id);
    setForm((f) => ({ ...f, platform, metrics: f.metrics.filter((m) => valid.includes(m)) }));
  }
  function toggleMetric(id: string) {
    setForm((f) => ({ ...f, metrics: f.metrics.includes(id) ? f.metrics.filter((m) => m !== id) : [...f.metrics, id] }));
  }

  async function saveWidget() {
    if (form.metrics.length === 0) return;
    setSaving(true);
    try {
      const payload = { ...form, dimension: autoDimension(form.displayType) };
      if (editing) {
        await fetch(`/api/clients/${clientId}/widgets`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: editing.id }) });
      } else {
        await fetch(`/api/clients/${clientId}/widgets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
    const res = await fetch(`/api/clients/${clientId}/public-dashboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: enable ? "generate" : "disable" }) });
    if (res.ok) await loadShare();
  }

  const shareUrl = share.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${share.token}` : "";

  return (
    <div className="space-y-6">
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
              <label className="mb-1 block text-xs font-medium text-brand-muted">פלטפורמה</label>
              <select value={form.platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={inputClass}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-muted">סוג תצוגה</label>
              <select value={form.displayType} onChange={(e) => setForm((f) => ({ ...f, displayType: e.target.value as DisplayType }))} className={inputClass}>
                {DISPLAYS.map((d) => <option key={d} value={d}>{DISPLAY_LABELS[d]}</option>)}
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
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">גודל</label>
            <div className="flex gap-2">
              {SIZES.map((s) => <button key={s.v} type="button" onClick={() => setForm((f) => ({ ...f, size: s.v }))} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${form.size === s.v ? "border-brand-gold bg-brand-gold/15 text-brand-dark" : "border-brand-border bg-brand-bg text-brand-muted"}`}>{s.label}</button>)}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-brand-border pt-4">
            <button onClick={() => setOpen(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">ביטול</button>
            <button onClick={saveWidget} disabled={saving || form.metrics.length === 0} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">{saving ? "שומר..." : "שמור"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
