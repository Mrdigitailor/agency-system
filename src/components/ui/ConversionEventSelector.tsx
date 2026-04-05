"use client";

import { useState, useEffect, useCallback } from "react";
import { TargetIcon, RefreshCw, CheckCircle2 } from "lucide-react";

interface EventOption {
  id: string;
  name: string;
  source: "custom" | "pixel" | "standard" | "insights";
}

interface ConversionEventSelectorProps {
  clientId: string;
  currentEvent: string;
}

const SOURCE_LABELS: Record<string, string> = {
  custom: "מותאם אישית",
  pixel: "Pixel",
  standard: "Standard",
  insights: "מזוהה מ-insights",
};

export default function ConversionEventSelector({ clientId, currentEvent }: ConversionEventSelectorProps) {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(currentEvent);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected(currentEvent);
  }, [currentEvent]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/platforms/meta/conversion-events/${clientId}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setEvents([]);
      } else {
        setEvents(data.events ?? []);
      }
    } catch {
      setError("שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/conversion-event`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: selected }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // קבץ לפי source
  const grouped = events.reduce<Record<string, EventOption[]>>((acc, e) => {
    if (!acc[e.source]) acc[e.source] = [];
    acc[e.source].push(e);
    return acc;
  }, {});

  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-brand-gold" />
          <h4 className="text-sm font-semibold text-brand-dark">הגדרת המרה — Meta</h4>
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

      {currentEvent && (
        <div className="mb-3 rounded-lg bg-brand-gold/10 p-2 text-xs">
          <span className="text-brand-muted">נוכחי: </span>
          <span className="font-medium text-brand-dark">{currentEvent}</span>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-brand-danger">{error}</p>
      )}

      {events.length > 0 && (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-brand-border bg-brand-light px-3 py-2 text-sm text-brand-dark focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold"
          >
            <option value="">בחר אירוע המרה...</option>
            {Object.entries(grouped).map(([source, items]) => (
              <optgroup key={source} label={SOURCE_LABELS[source] ?? source}>
                {items.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || selected === currentEvent}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
            {savedOk && (
              <span className="flex items-center gap-1 text-xs text-brand-success">
                <CheckCircle2 className="h-4 w-4" />
                נשמר בהצלחה
              </span>
            )}
          </div>

          <p className="mt-3 text-[10px] text-brand-muted">
            עלות להמרה והמרות יחושבו לפי האירוע שנבחר. שינוי זה ישפיע על כל הטאבים והדוחות.
          </p>
        </>
      )}

      {events.length === 0 && !loading && !error && (
        <p className="text-xs text-brand-muted">לחץ על &quot;טען אירועים&quot; כדי לראות את רשימת ההמרות הזמינות.</p>
      )}
    </div>
  );
}
