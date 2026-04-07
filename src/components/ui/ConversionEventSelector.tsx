"use client";

import { useState, useEffect, useCallback } from "react";
import { TargetIcon, RefreshCw, CheckCircle2 } from "lucide-react";
import { parseConversionEvents } from "@/lib/utils/metaMetrics";

interface EventOption {
  id: string;
  name: string;
  category: "leads" | "purchases" | "custom" | "engagement" | "other";
}

interface ConversionEventSelectorProps {
  clientId: string;
  currentEvent: string; // JSON array string or single string
}

const CATEGORY_LABELS: Record<string, string> = {
  leads: "לידים",
  purchases: "רכישות",
  custom: "המרות מותאמות",
  engagement: "מעורבות",
  other: "אחר",
};

export default function ConversionEventSelector({ clientId, currentEvent }: ConversionEventSelectorProps) {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState("");

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
      else setEvents(data.events ?? []);
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
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  }, {});

  const currentNames = selected.map((id) => events.find((e) => e.id === id)?.name ?? id);

  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-brand-gold" />
          <h4 className="text-sm font-semibold text-brand-dark">הגדרת המרות — Meta</h4>
        </div>
        <button
          onClick={loadEvents}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-bg disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "טוען..." : events.length > 0 ? "רענן" : "טען אירועים מחשבון המודעות"}
        </button>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 rounded-lg bg-brand-gold/10 p-2 text-xs">
          <span className="text-brand-muted">נבחרו ({selected.length}): </span>
          <span className="font-medium text-brand-dark">{currentNames.join(" + ")}</span>
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-brand-danger">{error}</p>}

      {events.length > 0 && (
        <>
          <div className="max-h-60 space-y-3 overflow-y-auto rounded-lg border border-brand-border bg-brand-light p-3">
            {Object.entries(grouped).map(([source, items]) => (
              <div key={source}>
                <p className="mb-1 text-[10px] font-semibold text-brand-muted">{CATEGORY_LABELS[source] ?? source}</p>
                <div className="space-y-1">
                  {items.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-brand-dark hover:bg-brand-bg">
                      <input
                        type="checkbox"
                        checked={selected.includes(e.id)}
                        onChange={() => toggleEvent(e.id)}
                        className="h-3.5 w-3.5 rounded border-brand-border"
                      />
                      <span>{e.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
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
            המרות = סכום כל האירועים שנבחרו. עלות להמרה = spend / סה״כ המרות.
          </p>
        </>
      )}

      {events.length === 0 && !loading && !error && (
        <p className="text-xs text-brand-muted">לחץ על &quot;טען אירועים&quot; לרשימת ההמרות הזמינות.</p>
      )}
    </div>
  );
}
