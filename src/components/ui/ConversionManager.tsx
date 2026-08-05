"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

export interface CampaignResult {
  campaignId: string;
  campaignName: string;
  platform: "meta" | "google" | "tiktok";
  resultType: "purchases" | "leads" | "registrations" | "messages" | "conversions" | "none";
  count: number;
  excluded: boolean;
}

const RESULT_LABEL: Record<string, string> = {
  purchases: "רכישות", leads: "לידים", registrations: "הרשמות", messages: "שיחות", conversions: "המרות", none: "—",
};
const PLATFORM_LABEL: Record<string, string> = { meta: "Meta", google: "Google", tiktok: "TikTok" };
const PLATFORM_COLOR: Record<string, string> = {
  meta: "bg-[#1877F2]/10 text-[#1877F2]", google: "bg-[#4285F4]/10 text-[#4285F4]", tiktok: "bg-black/10 text-black",
};

/** ניקוי שם קמפיין לתצוגה — הסרת קידומות פנימיות */
function cleanName(name: string): string {
  return name.replace(/mr\.?digitailor\s*\|\|?\s*/i, "").replace(/\s*\|\|\s*\d{1,2}\.\d{1,2}(\.\d{2,4})?\s*$/, "").trim() || name;
}

/**
 * מודל ניהול "אילו קמפיינים נספרים בהמרות" — סימון ידני להחרגת קמפיינים
 * שאינם למכירה (גיוס וכו'). שומר את הרשימה על הלקוח.
 */
export default function ConversionManager({
  clientId, campaigns, onClose, onSaved,
}: {
  clientId: string;
  campaigns: CampaignResult[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set(campaigns.filter((c) => c.excluded).map((c) => c.campaignId)));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => setExcluded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedCampaigns: JSON.stringify([...excluded]) }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const counted = campaigns.filter((c) => !excluded.has(c.campaignId)).reduce((s, c) => s + c.count, 0);
  const rows = [...campaigns].sort((a, b) => b.count - a.count);

  return (
    <Modal isOpen onClose={onClose} title="אילו קמפיינים נספרים בהמרות?" size="lg">
      <div className="space-y-3">
        <p className="text-sm text-brand-muted">
          כל קמפיין נספר לפי התוצאה שאליה הוא עושה אופטימיזציה. הסר סימון מקמפיינים שלא צריכים להיספר בהמרות (למשל גיוס).
        </p>
        <div className="max-h-[50vh] divide-y divide-brand-border overflow-y-auto rounded-lg border border-brand-border">
          {rows.map((c) => {
            const on = !excluded.has(c.campaignId);
            return (
              <label key={`${c.platform}-${c.campaignId}`} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 hover:bg-brand-bg">
                <div className="flex min-w-0 items-center gap-2.5">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.campaignId)} className="h-4 w-4 shrink-0 rounded border-brand-border accent-brand-gold" />
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${PLATFORM_COLOR[c.platform]}`}>{PLATFORM_LABEL[c.platform]}</span>
                  <span className={`truncate text-sm ${on ? "text-brand-dark" : "text-brand-muted line-through"}`}>{cleanName(c.campaignName)}</span>
                </div>
                <span className="shrink-0 text-xs text-brand-muted">
                  {c.count} {RESULT_LABEL[c.resultType]}
                </span>
              </label>
            );
          })}
          {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-brand-muted">אין קמפיינים בתקופה.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-brand-border pt-3">
          <span className="text-sm font-medium text-brand-dark">סה&quot;כ שייספרו: {counted.toLocaleString()} המרות</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">ביטול</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
