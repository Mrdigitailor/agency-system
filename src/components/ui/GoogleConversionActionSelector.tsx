"use client";

import { useState, useEffect, useCallback } from "react";
import { TargetIcon, RefreshCw, CheckCircle2, ChevronDown, Info } from "lucide-react";

interface ActionOption {
  name: string;
  category: string;
}

interface Props {
  clientId: string;
  currentAction: string; // JSON array של שמות
}

export default function GoogleConversionActionSelector({ clientId, currentAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [actions, setActions] = useState<ActionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const p = JSON.parse(currentAction || "[]");
      setSelected(Array.isArray(p) ? p : []);
    } catch {
      setSelected(currentAction ? [currentAction] : []);
    }
  }, [currentAction]);

  const loadActions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/platforms/google-ads/conversion-actions/${clientId}`);
      const data = await res.json();
      setActions(data.actions ?? []);
      if (data.error && (!data.actions || data.actions.length === 0)) setError(data.error);
    } catch {
      setError("שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const toggle = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/google-conversion-action`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: JSON.stringify(selected) }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <TargetIcon className="h-4 w-4 text-brand-gold" />
          <h4 className="text-sm font-semibold text-brand-dark">הגדרת המרות — Google Ads</h4>
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
              onClick={loadActions}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-bg disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "טוען..." : actions.length > 0 ? "רענן" : "טען פעולות המרה"}
            </button>
          </div>

          {selected.length > 0 && (
            <div className="mb-3 rounded-lg bg-brand-gold/10 p-2 text-xs">
              <span className="text-brand-muted">נבחרו ({selected.length}): </span>
              <span className="font-medium text-brand-dark">{selected.join(" + ")}</span>
            </div>
          )}

          {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-brand-danger">{error}</p>}

          <div className="mb-3 flex items-start gap-2 rounded-lg bg-blue-50 p-2 text-[11px] text-blue-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>בחר אילו conversion actions ייחשבו כהמרה בדוחות ובביצועים. אם לא נבחר כלום — נספרות כל ההמרות של החשבון.</span>
          </div>

          {actions.length > 0 && (
            <div className="mb-3 max-h-60 space-y-1 overflow-y-auto">
              {actions.map((a) => (
                <label key={a.name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-brand-dark hover:bg-brand-bg">
                  <input
                    type="checkbox"
                    checked={selected.includes(a.name)}
                    onChange={() => toggle(a.name)}
                    className="h-3.5 w-3.5 rounded border-brand-border"
                  />
                  <span>{a.name} {a.category && <span className="text-brand-muted">({a.category})</span>}</span>
                </label>
              ))}
            </div>
          )}

          {actions.length === 0 && !loading && !error && (
            <p className="mb-3 text-xs text-brand-muted">לחץ &quot;טען פעולות המרה&quot; כדי לראות את ה-conversion actions של החשבון.</p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={save}
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
        </div>
      )}
    </div>
  );
}
