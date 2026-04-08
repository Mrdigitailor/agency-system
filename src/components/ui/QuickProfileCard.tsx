"use client";

import { useEffect, useState } from "react";

const AWARENESS_LABELS: Record<string, string> = {
  unaware: "לא מודע",
  problem_aware: "מודע לבעיה",
  solution_aware: "מודע לפתרון",
  product_aware: "מודע למוצר",
  most_aware: "מוכן לקנייה",
};

interface ProfileData {
  businessSector?: string;
  usp?: string;
  awarenessLevels?: string[];
  toneOfVoice?: string;
}

export default function QuickProfileCard({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ProfileData | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/profile`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [clientId]);

  if (!data) return <p className="text-xs text-brand-muted">טוען...</p>;
  if (!data.businessSector && !data.usp) return <p className="text-xs text-brand-muted">תעודת זהות טרם הוגדרה</p>;

  return (
    <div className="grid grid-cols-2 gap-4">
      {data.businessSector && (
        <div>
          <p className="text-xs text-brand-muted">תחום עיסוק</p>
          <p className="text-sm font-medium text-brand-dark">{data.businessSector}</p>
        </div>
      )}
      {data.usp && (
        <div className="col-span-2">
          <p className="text-xs text-brand-muted">USP</p>
          <p className="text-sm text-brand-dark">{data.usp}</p>
        </div>
      )}
      {data.awarenessLevels && data.awarenessLevels.length > 0 && (
        <div className="col-span-2">
          <p className="text-xs text-brand-muted">קהלי יעד (רמות מודעות)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {data.awarenessLevels.map((level) => (
              <span key={level} className="rounded-full bg-brand-gold/10 px-2 py-0.5 text-[10px] font-medium text-brand-dark">
                {AWARENESS_LABELS[level] ?? level}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.toneOfVoice && (
        <div>
          <p className="text-xs text-brand-muted">טון דיבור</p>
          <p className="text-sm font-medium text-brand-dark">{data.toneOfVoice}</p>
        </div>
      )}
    </div>
  );
}
