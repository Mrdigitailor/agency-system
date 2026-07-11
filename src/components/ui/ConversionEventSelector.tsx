"use client";

import { useState, useEffect, useCallback } from "react";
import { TargetIcon, RefreshCw, CheckCircle2, Info, ChevronDown } from "lucide-react";
import { parseConversionEvents } from "@/lib/utils/metaMetrics";

interface EventOption {
  id: string;
  name: string;
  eventType: string; // "Standard Event" | "Custom Event" | "Custom Conversion" | "Lead Form"
}

interface ConversionEventSelectorProps {
  clientId: string;
  currentEvent: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  "Standard Event": "Standard Events",
  "Custom Event": "Custom Events",
  "Custom Conversion": "Custom Conversions",
  "Lead Form": "Lead Forms",
  purchases: "רכישות",
  custom: "המרות מותאמות",
  engagement: "מעורבות",
  other: "אחר",
};

// אירועי on-platform — לא נשאבים מהפיקסל. מגיעים ישירות מקמפיינים
// (Click-to-WhatsApp, Click-to-Messenger, Lead Ads, Video Ads וכו').
const ON_PLATFORM_EVENTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "onsite_conversion.messaging_conversation_started_7d", label: "שיחות מסנג'ר/ווטסאפ (Messaging Conversations)" },
  { value: "onsite_conversion.messaging_first_reply", label: "תגובה ראשונה בהודעות (First Reply)" },
  { value: "landing_page_view", label: "צפיות בדף נחיתה (Landing Page Views)" },
  { value: "link_click", label: "קליקים על קישור (Link Clicks)" },
  { value: "post_engagement", label: "מעורבות בפוסט (Post Engagement)" },
  { value: "video_view", label: "צפיות וידאו (Video Views)" },
  { value: "lead", label: "לידים — טפסי Meta (On-Facebook Leads)" },
  { value: "page_engagement", label: "מעורבות בעמוד (Page Engagement)" },
];

const ON_PLATFORM_LABEL_BY_VALUE = new Map(ON_PLATFORM_EVENTS.map((e) => [e.value, e.label]));

export default function ConversionEventSelector({ clientId, currentEvent }: ConversionEventSelectorProps) {
  const [expanded, setExpanded] = useState(false); // סגור כברירת מחדל — נפתח בלחיצה על הכותרת
  const [events, setEvents] = useState<EventOption[]>([]);
  const [pixelName, setPixelName] = useState<string | null>(null);
  const [hasPixel, setHasPixel] = useState<boolean | null>(null); // null = loading
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState("");

  // בדיקה אם יש פיקסל נבחר
  useEffect(() => {
    fetch(`/api/clients/${clientId}/connections`)
      .then((r) => r.json())
      .then((conns: Array<{ assets: Array<{ assetType: string; isSelected: boolean }> }>) => {
        const pixelSelected = conns.some((c) =>
          c.assets.some((a) => a.assetType === "pixel" && a.isSelected)
        );
        setHasPixel(pixelSelected);
      })
      .catch(() => setHasPixel(false));
  }, [clientId]);

  useEffect(() => {
    setSelected(parseConversionEvents(currentEvent));
  }, [currentEvent]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/platforms/meta/conversion-events/${clientId}`);
      const data = await res.json();
      if (data.error) { setError(data.error); setEvents([]); }
      else {
        setEvents(data.events ?? []);
        setPixelName(data.pixelName ?? null);
      }
    } catch { setError("שגיאה בטעינה"); }
    finally { setLoading(false); }
  }, [clientId]);

  const toggleEvent = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/conversion-event`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: JSON.stringify(selected) }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally { setSaving(false); }
  };

  const grouped = events.reduce<Record<string, EventOption[]>>((acc, e) => {
    if (!acc[e.eventType]) acc[e.eventType] = [];
    acc[e.eventType].push(e);
    return acc;
  }, {});

  // שם קריא לאירוע פיקסל מותאם מתוך ה-action_type השמור
  const prettyEventName = (id: string) => {
    if (id.startsWith("offsite_conversion.fb_pixel_custom.")) return id.slice("offsite_conversion.fb_pixel_custom.".length);
    if (id.startsWith("offsite_conversion.fb_pixel_")) return id.slice("offsite_conversion.fb_pixel_".length).replace(/_/g, " ");
    return id;
  };

  // שם תצוגה לכל ערך נבחר — מחפש קודם באירועי הפיקסל ואז בקבועי on-platform
  const labelFor = (id: string) =>
    events.find((e) => e.id === id)?.name ?? ON_PLATFORM_LABEL_BY_VALUE.get(id) ?? prettyEventName(id);
  const currentNames = selected.map(labelFor);

  // אירועים שנבחרו בעבר אך אינם ברשימות הנוכחיות (למשל אירוע פיקסל שלא ירה לאחרונה) —
  // חייבים להציג אותם כדי שאפשר יהיה לראות ולבטל אותם.
  const knownIds = new Set<string>([...events.map((e) => e.id), ...ON_PLATFORM_EVENTS.map((e) => e.value)]);
  const orphanSelected = selected.filter((id) => !knownIds.has(id));

  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
      {/* כותרת — לחיצה פותחת/סוגרת. סגור כברירת מחדל. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-brand-gold" />
          <h4 className="text-sm font-semibold text-brand-dark">הגדרת המרות — Meta</h4>
          {selected.length > 0 && (
            <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-[10px] font-semibold text-brand-dark">
              {selected.length} נבחרו
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-brand-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
      <div className="mt-3">
      <div className="mb-3 flex justify-end">
        <button
          onClick={loadEvents}
          disabled={loading || hasPixel === null || hasPixel === false}
          className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-bg disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "טוען..." : events.length > 0 ? "רענן" : "טען אירועים מהפיקסל"}
        </button>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 rounded-lg bg-brand-gold/10 p-2 text-xs">
          <span className="text-brand-muted">נבחרו ({selected.length}): </span>
          <span className="font-medium text-brand-dark">{currentNames.join(" + ")}</span>
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-brand-danger">{error}</p>}

      {/* ===== אירועים פעילים שלא ברשימה הנוכחית ===== */}
      {orphanSelected.length > 0 && (
        <div className="mb-3 rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-3">
          <p className="mb-1 text-[11px] font-semibold text-brand-dark">אירועים פעילים כעת</p>
          <p className="mb-2 text-[10px] text-brand-muted">
            נבחרו בעבר וממשיכים להיספר, אך לא הופיעו בשליפה האחרונה מהפיקסל (לא ירו לאחרונה). אפשר לבטל בחירה כאן.
          </p>
          <div className="space-y-1">
            {orphanSelected.map((id) => (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-brand-dark hover:bg-brand-bg">
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggleEvent(id)}
                  className="h-3.5 w-3.5 rounded border-brand-border"
                />
                <span>{prettyEventName(id)} <span className="text-brand-muted">({id})</span></span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ===== סקשן 1: אירועי פיקסל ===== */}
      <div className="mb-3 rounded-lg border border-brand-border bg-brand-light p-3">
        <p className="mb-2 text-[11px] font-semibold text-brand-muted">
          אירועי פיקסל {pixelName ? `— ${pixelName}` : ""}
        </p>

        {hasPixel === false && (
          <div className="flex items-start gap-2 rounded-lg bg-orange-50 p-2 text-[11px] text-orange-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>אין פיקסל נבחר. כדי לראות אירועי פיקסל יש לבחור פיקסל ב&quot;ניהול נכסים&quot;. אירועי פלטפורמה למטה זמינים גם בלי פיקסל.</span>
          </div>
        )}

        {events.length > 0 && (
          <div className="max-h-60 space-y-3 overflow-y-auto">
            {Object.entries(grouped).map(([source, items]) => (
              <div key={source}>
                <p className="mb-1 text-[10px] font-semibold text-brand-muted">
                  {CATEGORY_LABELS[source] ?? source}{pixelName && source !== "Lead Form" ? ` — ${pixelName}` : ""}
                </p>
                <div className="space-y-1">
                  {items.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-brand-dark hover:bg-brand-bg">
                      <input
                        type="checkbox"
                        checked={selected.includes(e.id)}
                        onChange={() => toggleEvent(e.id)}
                        className="h-3.5 w-3.5 rounded border-brand-border"
                      />
                      <span>{e.name} <span className="text-brand-muted">({e.eventType})</span></span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {events.length === 0 && !loading && !error && hasPixel !== false && (
          <p className="text-xs text-brand-muted">
            לחץ &quot;טען אירועים מהפיקסל&quot; כדי לראות את ההמרות שהפיקסל קולט.
          </p>
        )}
      </div>

      {/* ===== סקשן 2: אירועי פלטפורמה ===== */}
      <div className="mb-3 rounded-lg border border-brand-border bg-brand-light p-3">
        <p className="mb-1 text-[11px] font-semibold text-brand-muted">אירועי פלטפורמה (On-Platform)</p>
        <p className="mb-2 text-[10px] text-brand-muted">
          אירועים שלא תלויים בפיקסל — מתאימים לקמפיינים של Click-to-WhatsApp/Messenger, Lead Ads ו-Video Views.
        </p>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {ON_PLATFORM_EVENTS.map((e) => (
            <label key={e.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-brand-dark hover:bg-brand-bg">
              <input
                type="checkbox"
                checked={selected.includes(e.value)}
                onChange={() => toggleEvent(e.value)}
                className="h-3.5 w-3.5 rounded border-brand-border"
              />
              <span>{e.label} <span className="text-brand-muted">({e.value})</span></span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
        >
          {saving ? "שומר..." : `שמור (${selected.length} נבחרו)`}
        </button>
        {savedOk && (
          <span className="flex items-center gap-1 text-xs text-brand-success">
            <CheckCircle2 className="h-4 w-4" />
            נשמר
          </span>
        )}
      </div>
      <p className="mt-2 text-[10px] text-brand-muted">
        המרות = סכום כל האירועים שנבחרו (פיקסל + פלטפורמה). עלות להמרה = spend / סה״כ המרות.
      </p>
      </div>
      )}
    </div>
  );
}
