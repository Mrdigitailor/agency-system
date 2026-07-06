"use client";

import { useState, useEffect, useCallback } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Pencil, Trash2, GripVertical, Loader2, Link2, Copy, ExternalLink, ArrowRight, FileText, Share2, ChevronLeft, Sparkles } from "lucide-react";
import { WidgetRenderer, type WidgetDTO } from "@/components/dashboard/DashboardWidgets";
import { getMetricsForPlatform, PLATFORM_LABELS, DISPLAY_LABELS, DIMENSION_LABELS, validDimensions, type Platform, type DisplayType, type Dimension } from "@/lib/dashboard/metrics";

interface WidgetFilter { field: string; operator: string; value: string }
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
  /** סינון לפי שם קמפיין (מכיל) — ריק = כל הקמפיינים */
  campaignFilter: string;
  /** בפילוח "לפי סוג המרה" — תוויות סוגים שהוסתרו */
  excludeActions: string[];
}

/** חילוץ סינון הקמפיין ממערך ה-filters שמגיע מה-API */
function extractCampaignFilter(filters: unknown): string {
  if (!Array.isArray(filters)) return "";
  const c = (filters as WidgetFilter[]).find((f) => f && f.field === "campaign" && typeof f.value === "string");
  return c?.value ?? "";
}

/** חילוץ סוגי ההמרות המוחרגים ממערך ה-filters */
function extractExcludeActions(filters: unknown): string[] {
  if (!Array.isArray(filters)) return [];
  return (filters as WidgetFilter[]).filter((f) => f && f.field === "excludeAction" && typeof f.value === "string").map((f) => f.value);
}

const PLATFORMS: Platform[] = ["meta", "google_ads", "tiktok", "all", "ga4"];
const DISPLAYS: DisplayType[] = ["kpi", "line", "area", "bar", "pie", "table", "platform_header", "heading", "text"];
const isTextType = (d: DisplayType) => d === "heading" || d === "text";
const isNoMetrics = (d: DisplayType) => isTextType(d) || d === "platform_header";
const emptyForm = (): Widget => ({ id: "", platform: "meta", metrics: [], displayType: "kpi", dimension: "none", size: "full", title: "", textBody: "", compare: false, campaignFilter: "", excludeActions: [] });
const SIZES = [
  { v: "full", label: "מלא" },
  { v: "half", label: "חצי" },
  { v: "third", label: "שליש" },
];
const cardClass = "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";
const inputClass = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm focus:border-brand-gold focus:outline-none";
const SPAN: Record<string, string> = { full: "md:col-span-12", half: "md:col-span-6", third: "md:col-span-4" };

const RANGE_PRESETS = [
  { key: "month", label: "החודש" },
  { key: "7", label: "7 ימים" },
  { key: "28", label: "28 ימים" },
  { key: "90", label: "90 ימים" },
  { key: "custom", label: "מותאם" },
];
function presetDates(key: string): { since: string; until: string } {
  const t = new Date();
  const until = t.toISOString().slice(0, 10);
  if (key === "month") return { since: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`, until };
  return { since: new Date(t.getTime() - (Number(key) - 1) * 86400000).toISOString().slice(0, 10), until };
}

// קוביה בקנבס — תצוגה חיה + בחירה לעריכה + גרירה
function CanvasCard({ w, currency, selected, onSelect, onDelete }: { w: WidgetDTO; currency: string; selected: boolean; onSelect: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={`${SPAN[w.size] ?? SPAN.full} group relative`}>
      <div onClick={onSelect} className={`cursor-pointer rounded-lg transition ${selected ? "ring-2 ring-brand-gold ring-offset-2" : "hover:ring-1 hover:ring-brand-gold/40"}`}>
        <WidgetRenderer widget={w} currency={currency} />
      </div>
      <div className="absolute left-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button {...attributes} {...listeners} className="cursor-grab rounded bg-white/90 p-1 text-brand-muted shadow-sm hover:text-brand-dark"><GripVertical className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded bg-white/90 p-1 text-brand-muted shadow-sm hover:text-brand-danger"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function ReportEditor({ clientId, reportId, reportName, onBack }: { clientId: string; reportId: string; reportName: string; onBack: () => void }) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [preview, setPreview] = useState<{ widgets: WidgetDTO[]; client: { currency: string } } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [share, setShare] = useState<{ enabled: boolean; token: string | null }>({ enabled: false, token: null });
  const [copied, setCopied] = useState(false);

  // עריכה — בחירת ווידג'ט מהקנבס (null=אין, "new"=חדש)
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Widget>(emptyForm());
  const [saving, setSaving] = useState(false);
  // סוגי המרות זמינים — לבורר "לפי סוג המרה"
  const [actionTypes, setActionTypes] = useState<{ label: string; count: number }[]>([]);
  // מחולל ווידג'טים מטקסט חופשי
  const [prompt, setPrompt] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptResult, setPromptResult] = useState<{ created: number; unsupported: string[] } | null>(null);

  // טווח תאריכים לתצוגה המקדימה (הלקוח יכול לבחור גם בעמוד הציבורי)
  const [range, setRange] = useState("month");
  const [customSince, setCustomSince] = useState(() => presetDates("month").since);
  const [customUntil, setCustomUntil] = useState(() => presetDates("month").until);
  const { since, until } = range === "custom" ? { since: customSince, until: customUntil } : presetDates(range);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadWidgets = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/widgets?reportId=${reportId}`);
    if (res.ok) {
      const rows = (await res.json()) as Array<Widget & { filters?: unknown }>;
      setWidgets(rows.map((w) => ({ ...w, campaignFilter: extractCampaignFilter(w.filters), excludeActions: extractExcludeActions(w.filters) })));
    }
  }, [clientId, reportId]);

  const loadShare = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/reports/${reportId}/public`);
    if (res.ok) setShare(await res.json());
  }, [clientId, reportId]);

  const loadPreview = useCallback(async (s: string, u: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dashboard-preview?reportId=${reportId}&since=${s}&until=${u}`);
      if (res.ok) setPreview(await res.json());
    } finally {
      setPreviewLoading(false);
    }
  }, [clientId, reportId]);

  useEffect(() => { loadWidgets(); loadShare(); }, [loadWidgets, loadShare]);
  useEffect(() => { loadPreview(since, until); }, [loadPreview, since, until]);

  // טוען את סוגי ההמרות הזמינים כשעורכים ווידג'ט "לפי סוג המרה"
  useEffect(() => {
    if (form.dimension !== "action" || selectedId === null) { setActionTypes([]); return; }
    const qs = new URLSearchParams({ since, until, platform: form.platform, ...(form.campaignFilter ? { campaignFilter: form.campaignFilter } : {}) });
    fetch(`/api/clients/${clientId}/action-types?${qs}`).then((r) => (r.ok ? r.json() : [])).then(setActionTypes).catch(() => setActionTypes([]));
  }, [clientId, form.dimension, form.platform, form.campaignFilter, selectedId, since, until]);

  function selectNew() {
    setSelectedId("new");
    setForm(emptyForm());
  }
  function selectWidget(id: string) {
    const w = widgets.find((x) => x.id === id);
    if (w) { setSelectedId(id); setForm({ ...w }); }
  }

  // שינוי סוג תצוגה — מתאים את הפילוח לברירת מחדל חוקית
  function setDisplay(displayType: DisplayType) {
    setForm((f) => {
      const dims = validDimensions(displayType, f.platform);
      const dimension = dims.includes(f.dimension as Dimension) ? f.dimension : dims[0];
      return { ...f, displayType, dimension };
    });
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
    if (!isNoMetrics(form.displayType) && form.metrics.length === 0) return;
    if (isText && !form.title.trim() && !form.textBody.trim()) return;
    setSaving(true);
    try {
      // ממירים סינון קמפיין + סוגי המרות מוחרגים לפורמט ה-filters שנשמר ב-DB
      const filters: WidgetFilter[] = [];
      if (form.campaignFilter.trim()) filters.push({ field: "campaign", operator: "contains", value: form.campaignFilter.trim() });
      if (form.dimension === "action") for (const a of form.excludeActions) filters.push({ field: "excludeAction", operator: "ne", value: a });
      const payload = { ...form, filters };
      if (selectedId && selectedId !== "new") {
        await fetch(`/api/clients/${clientId}/widgets`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: selectedId }) });
      } else {
        await fetch(`/api/clients/${clientId}/widgets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, reportId }) });
      }
      setSelectedId(null);
      await loadWidgets();
      await loadPreview(since, until);
    } finally {
      setSaving(false);
    }
  }

  async function deleteWidget(id: string) {
    if (!confirm("למחוק את הווידג'ט?")) return;
    await fetch(`/api/clients/${clientId}/widgets?widgetId=${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await loadWidgets();
    await loadPreview(since, until);
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = preview ? preview.widgets.map((w) => w.id) : widgets.map((w) => w.id);
    const oldI = ids.indexOf(String(active.id));
    const newI = ids.indexOf(String(over.id));
    if (oldI < 0 || newI < 0) return;
    const order = arrayMove(ids, oldI, newI);
    if (preview) setPreview({ ...preview, widgets: arrayMove(preview.widgets, oldI, newI) });
    setWidgets((prev) => order.map((id) => prev.find((w) => w.id === id)).filter(Boolean) as Widget[]);
    await fetch(`/api/clients/${clientId}/widgets`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
    await loadPreview(since, until);
  }

  async function generateFromPrompt() {
    const text = prompt.trim();
    if (!text || promptLoading) return;
    setPromptLoading(true);
    setPromptResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/widgets/from-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, reportId }),
      });
      const data = await res.json();
      if (res.ok) {
        setPromptResult({ created: data.created ?? 0, unsupported: data.unsupported ?? [] });
        if (data.created > 0) { setPrompt(""); await loadWidgets(); await loadPreview(since, until); }
      } else {
        setPromptResult({ created: 0, unsupported: [data.error ?? "שגיאה"] });
      }
    } catch {
      setPromptResult({ created: 0, unsupported: ["שגיאה בחיבור. נסה שוב."] });
    } finally {
      setPromptLoading(false);
    }
  }

  async function toggleShare(enable: boolean) {
    const res = await fetch(`/api/clients/${clientId}/reports/${reportId}/public`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: enable ? "generate" : "disable" }) });
    if (res.ok) await loadShare();
  }

  const shareUrl = share.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${share.token}` : "";

  return (
    <div className="space-y-4">
      {/* בר עליון — חזרה, שם הדוח, טווח תאריכים, שיתוף */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-sm text-brand-muted hover:bg-brand-bg"><ArrowRight className="h-4 w-4" />כל הדוחות</button>
          <h2 className="text-lg font-semibold text-brand-dark">{reportName}</h2>
          {previewLoading && <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light p-0.5">
            {RANGE_PRESETS.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${range === r.key ? "bg-brand-gold text-brand-dark" : "text-brand-muted hover:text-brand-dark"}`}>{r.label}</button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-light px-2 py-1" dir="ltr">
              <input type="date" value={customSince} max={customUntil} onChange={(e) => setCustomSince(e.target.value)} className="bg-transparent text-xs text-brand-dark focus:outline-none" />
              <span className="text-brand-muted">–</span>
              <input type="date" value={customUntil} min={customSince} max={presetDates("month").until} onChange={(e) => setCustomUntil(e.target.value)} className="bg-transparent text-xs text-brand-dark focus:outline-none" />
            </div>
          )}
          {share.enabled && share.token ? (
            <a href={shareUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg bg-brand-dark px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark/90"><ExternalLink className="h-3.5 w-3.5" />פתח קישור</a>
          ) : (
            <button onClick={() => toggleShare(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80"><Share2 className="h-3.5 w-3.5" />צור קישור שיתוף</button>
          )}
        </div>
      </div>

      {/* שורת קישור ציבורי כשפעיל */}
      {share.enabled && share.token && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-gold/30 bg-brand-gold/5 p-2">
          <Link2 className="h-4 w-4 shrink-0 text-brand-gold" />
          <input readOnly value={shareUrl} className="flex-1 bg-transparent font-mono text-xs text-brand-dark focus:outline-none" dir="ltr" />
          <button onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-2.5 py-1.5 text-xs hover:bg-brand-bg"><Copy className="h-3.5 w-3.5" />{copied ? "הועתק" : "העתק"}</button>
          <button onClick={() => toggleShare(true)} className="shrink-0 text-xs text-brand-muted hover:text-brand-dark">סבב</button>
          <button onClick={() => toggleShare(false)} className="shrink-0 text-xs text-brand-danger hover:underline">בטל</button>
        </div>
      )}

      {/* שני פאנלים — מאפייני נתונים (שמאל) + קנבס (ימין) */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* פאנל מאפייני נתונים */}
        <aside className="space-y-4 lg:w-80 lg:shrink-0">
          {/* מחולל ווידג'טים מטקסט חופשי */}
          <div className="rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-brand-gold" />
              <h3 className="text-sm font-semibold text-brand-dark">צור ווידג&apos;ט מתיאור</h3>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              dir="rtl"
              disabled={promptLoading}
              className={inputClass}
              placeholder="לדוגמה: טבלה של קליקים, המרות ועלות להמרה לפי קמפיין — רק לקמפיינים של single family"
            />
            <button
              onClick={generateFromPrompt}
              disabled={promptLoading || !prompt.trim()}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark/90 disabled:opacity-50"
            >
              {promptLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {promptLoading ? "בונה..." : "צור"}
            </button>
            {promptResult && (
              <div className="mt-3 space-y-2 text-xs">
                {promptResult.created > 0 && (
                  <p className="rounded-lg bg-brand-success/10 px-2.5 py-1.5 font-medium text-brand-success">נוצרו {promptResult.created} ווידג&apos;טים ✓</p>
                )}
                {promptResult.unsupported.length > 0 && (
                  <div className="rounded-lg border border-brand-warning/30 bg-brand-warning/5 px-2.5 py-2">
                    <p className="mb-1 font-medium text-brand-dark">לא הצלחתי לבנות את זה — כדאי לפנות לפיתוח:</p>
                    <ul className="list-disc space-y-0.5 pr-4 text-brand-muted">
                      {promptResult.unsupported.map((u, i) => <li key={i}>{u}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
            <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
              <h3 className="text-sm font-semibold text-brand-dark">מאפייני נתונים</h3>
              <button onClick={selectNew} className="flex items-center gap-1 rounded-lg bg-brand-gold px-2.5 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80"><Plus className="h-3.5 w-3.5" />חדש</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {selectedId === null ? (
                <div className="py-8 text-center text-sm text-brand-muted">
                  <FileText className="mx-auto mb-2 h-7 w-7 opacity-50" />
                  בחר ווידג&apos;ט מהקנבס לעריכה,<br />או הוסף חדש.
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-brand-muted">כותרת</label>
                    <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} placeholder="לדוגמה: הוצאה והמרות" />
                  </div>
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

                  {isTextType(form.displayType) ? (
                    form.displayType === "text" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-brand-muted">תוכן הטקסט</label>
                        <textarea value={form.textBody} onChange={(e) => setForm((f) => ({ ...f, textBody: e.target.value }))} rows={4} dir="rtl" className={inputClass} placeholder="טקסט חופשי שיוצג ללקוח..." />
                      </div>
                    )
                  ) : form.displayType === "platform_header" ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-brand-muted">פלטפורמה</label>
                      <select value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Platform }))} className={inputClass}>
                        {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                      </select>
                      <p className="mt-1.5 text-xs text-brand-muted">יוצג הלוגו + שם הפלטפורמה ככותרת סקשן.</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-brand-muted">מקור נתונים (פלטפורמה)</label>
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
                      {form.platform !== "ga4" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-brand-muted">סינון קמפיינים (מכיל)</label>
                          <input
                            value={form.campaignFilter}
                            onChange={(e) => setForm((f) => ({ ...f, campaignFilter: e.target.value }))}
                            className={inputClass}
                            placeholder="לדוגמה: שם מוצר — יוצגו רק קמפיינים תואמים"
                          />
                        </div>
                      )}
                      {form.dimension === "action" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-brand-muted">סוגי המרות להצגה</label>
                          {actionTypes.length === 0 ? (
                            <p className="text-xs text-brand-muted">אין סוגי המרות בטווח שנבחר.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {actionTypes.map((a) => {
                                const on = !form.excludeActions.includes(a.label);
                                return (
                                  <button
                                    key={a.label}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, excludeActions: on ? [...f.excludeActions, a.label] : f.excludeActions.filter((x) => x !== a.label) }))}
                                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${on ? "border-brand-gold bg-brand-gold/15 text-brand-dark" : "border-brand-border bg-brand-bg text-brand-muted line-through hover:bg-brand-light"}`}
                                    title={on ? "מוצג — לחץ להסתרה" : "מוסתר — לחץ להצגה"}
                                  >
                                    {a.label} · {a.count}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <p className="mt-1 text-[11px] text-brand-muted">לחיצה מסירה סוג המרה מהתצוגה (למשל שלבי-ביניים).</p>
                        </div>
                      )}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-brand-muted">מדדים</label>
                        <div className="flex flex-wrap gap-1.5">
                          {getMetricsForPlatform(form.platform).map((m) => (
                            <button key={m.id} type="button" onClick={() => toggleMetric(m.id)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${form.metrics.includes(m.id) ? "border-brand-gold bg-brand-gold/15 text-brand-dark" : "border-brand-border bg-brand-bg text-brand-muted hover:bg-brand-light"}`}>{m.label}</button>
                          ))}
                        </div>
                      </div>
                      {form.displayType === "kpi" && (
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-brand-dark">
                          <input type="checkbox" checked={form.compare} onChange={(e) => setForm((f) => ({ ...f, compare: e.target.checked }))} className="h-4 w-4 rounded border-brand-border" />
                          השוואה לתקופה הקודמת
                        </label>
                      )}
                    </>
                  )}

                  <div className="flex gap-2 border-t border-brand-border pt-3">
                    <button onClick={saveWidget} disabled={saving || (!isNoMetrics(form.displayType) && form.metrics.length === 0)} className="flex-1 rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark/90 disabled:opacity-50">{saving ? "שומר..." : selectedId === "new" ? "הוסף לדוח" : "החל שינויים"}</button>
                    <button onClick={() => setSelectedId(null)} className="rounded-lg border border-brand-border px-3 py-2 text-sm text-brand-muted hover:bg-brand-bg">סגור</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* קנבס — תצוגה חיה, בחירה לעריכה, גרירה */}
        <div className="min-w-0 flex-1">
          {(preview?.widgets.length ?? 0) === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-brand-border text-brand-muted">
              <FileText className="mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">אין ווידג&apos;טים בדוח.</p>
              <button onClick={selectNew} className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80"><Plus className="h-4 w-4" />הוסף ווידג&apos;ט ראשון</button>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={(preview?.widgets ?? []).map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                  {(preview?.widgets ?? []).map((w) => (
                    <CanvasCard key={w.id} w={w} currency={preview!.client.currency} selected={selectedId === w.id} onSelect={() => selectWidget(w.id)} onDelete={() => deleteWidget(w.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
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
  const [autoBuild, setAutoBuild] = useState(false);

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

  // דשבורד חכם — הסוכן בונה סט ווידג'טים אוטומטית מפרופיל העסק
  async function createSmartDashboard() {
    setAutoBuild(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/reports/auto-build`, { method: "POST" });
      if (res.ok) {
        const r = await res.json();
        await load();
        setOpenId(r.id);
      } else {
        alert("שגיאה בבניית הדשבורד — נסה שוב");
      }
    } finally {
      setAutoBuild(false);
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
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={createSmartDashboard} disabled={autoBuild} className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">
            {autoBuild ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {autoBuild ? "בונה..." : "דשבורד חכם"}
          </button>
          <button onClick={createReport} disabled={creating} className="flex items-center gap-1.5 rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark/90 disabled:opacity-50"><Plus className="h-4 w-4" />דוח חדש</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-brand-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : reports.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <FileText className="mx-auto h-8 w-8 text-brand-muted" />
          <p className="mt-2 text-sm text-brand-muted">אין דשבורדים עדיין.</p>
          <p className="mt-1 text-xs text-brand-muted">תן לסוכן לבנות דשבורד מותאם לסוג העסק — או בנה ידנית מאפס.</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button onClick={createSmartDashboard} disabled={autoBuild} className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">
              {autoBuild ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {autoBuild ? "בונה..." : "דשבורד חכם"}
            </button>
            <button onClick={createReport} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark">בנה ידנית</button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border bg-brand-bg text-xs text-brand-muted">
              <tr>
                <th className="px-4 py-3 text-right font-medium">שם הדוח</th>
                <th className="px-4 py-3 text-right font-medium">ווידג&apos;טים</th>
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
