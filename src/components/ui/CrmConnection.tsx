"use client";

import { useEffect, useState } from "react";
import { Database, CheckCircle2 } from "lucide-react";

interface CrmInfo { label: string; detail: string }

// מציג את מקור ה-CRM/לידים החיצוני המחובר ללקוח (Google Sheet / Arbox / ...),
// כדי שנדע בסקירה הכללית בדיוק מה ומי מחובר — לצד חיבורי הפלטפורמות.
export default function CrmConnection({ clientId }: { clientId: string }) {
  const [crm, setCrm] = useState<CrmInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/clients/${clientId}/crm-source`)
      .then((r) => r.json())
      .then((d: { crm: CrmInfo | null }) => { if (alive) setCrm(d.crm); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId]);

  if (loading) return null;

  return (
    <div className="border-t border-brand-border pt-4">
      <p className="mb-3 text-xs font-semibold text-brand-muted">מקור לידים / CRM חיצוני</p>
      {crm ? (
        <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-light p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/20">
            <Database className="h-5 w-5 text-brand-dark" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-brand-dark">
              {crm.label}
              <CheckCircle2 className="h-4 w-4 text-success" />
            </p>
            <p className="truncate text-xs text-brand-muted">{crm.detail}</p>
          </div>
          <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">מחובר</span>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-brand-border px-3 py-2.5 text-xs text-brand-muted">
          לא מחובר מקור לידים חיצוני
        </p>
      )}
    </div>
  );
}
