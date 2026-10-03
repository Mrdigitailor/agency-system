"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutList, Loader2, Search } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { normalizeName } from "@/lib/reports/group-by-product";

interface Campaign { id: string; name: string }

// סגמנטים שחוזרים בכל שם קמפיין ואינם שם המוצר
const BOILERPLATE = /^(nova|lead gen|website lead|b2b|b2c|engagement|traffic|conversions|messages)$/i;
const DATE_SEG = /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/;

/** מציע שם סקשן מתוך שם הקמפיין — הסגמנט הראשון שאינו boilerplate או תאריך */
function suggestTitle(name: string): string {
  const segs = name.split("|").map((s) => s.trim()).filter((s) => s && !DATE_SEG.test(s) && !BOILERPLATE.test(s));
  return segs[0] ?? name.trim();
}

/**
 * כפתור + חלון "הוסף סקשן קמפיין": בוחרים קמפיין, וכל קוביות המידע שלו
 * (מדדים, גיל, מכשיר, מגמות, קמפיינים/קהלים/מודעות) מתווספות לדוח בפעולה אחת.
 */
export default function AddCampaignSection({ clientId, reportId, onAdded }: { clientId: string; reportId: string; onAdded: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/clients/${clientId}/campaigns?platform=meta`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const shown = useMemo(() => {
    const q = normalizeName(search);
    return q ? campaigns.filter((c) => normalizeName(c.name).includes(q)) : campaigns;
  }, [campaigns, search]);

  // אותה התאמה שהמנוע מבצע בשרת (שם מנורמל מכיל) — כדי שהמספר יהיה אמין
  const matched = useMemo(() => {
    const f = normalizeName(filter);
    return f ? campaigns.filter((c) => normalizeName(c.name).includes(f)) : [];
  }, [campaigns, filter]);

  function pick(c: Campaign) {
    const t = suggestTitle(c.name);
    setTitle(t);
    setFilter(t);
  }

  function close() {
    setOpen(false);
    setSearch(""); setTitle(""); setFilter(""); setError("");
  }

  async function submit() {
    if (!filter.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}/reports/${reportId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), campaignFilter: filter.trim() }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "שגיאה בהוספת הסקשן"); return; }
      close();
      await onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light px-2.5 py-1.5 text-xs font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-bg">
        <LayoutList className="h-3.5 w-3.5" />סקשן קמפיין
      </button>

      <Modal isOpen={open} onClose={close} title="הוסף סקשן קמפיין" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">בחר קמפיין, וכל קוביות המידע שלו יתווספו לסוף הדוח: מדדים, לידים לפי גיל ומכשיר, מגמות חודשיות וטבלאות קמפיינים, קהלים ומודעות.</p>

          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-brand-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש קמפיין..." className="w-full rounded-lg border border-brand-border bg-brand-light py-2 pl-3 pr-9 text-sm text-brand-dark focus:border-brand-gold focus:outline-none" />
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-brand-border">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-brand-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>
              ) : shown.length === 0 ? (
                <div className="py-6 text-center text-sm text-brand-muted">לא נמצאו קמפיינים</div>
              ) : (
                shown.map((c) => (
                  <button key={c.id} type="button" onClick={() => pick(c)} dir="ltr" className={`block w-full truncate border-b border-brand-border px-3 py-2 text-right text-xs transition-colors duration-200 last:border-b-0 hover:bg-brand-bg ${matched.some((m) => m.id === c.id) ? "bg-brand-gold/15 text-brand-dark" : "text-brand-muted"}`}>
                    {c.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-brand-dark">
              שם הסקשן
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-border bg-brand-light px-3 py-2 text-sm font-normal focus:border-brand-gold focus:outline-none" />
            </label>
            <label className="block text-xs font-medium text-brand-dark">
              קמפיינים ששמם מכיל
              <input value={filter} onChange={(e) => setFilter(e.target.value)} dir="ltr" className="mt-1 w-full rounded-lg border border-brand-border bg-brand-light px-3 py-2 text-right text-sm font-normal focus:border-brand-gold focus:outline-none" />
            </label>
          </div>
          {filter.trim() && (
            <p className="text-xs text-brand-muted">
              {matched.length > 0 ? `${matched.length} קמפיינים תואמים כרגע. ` : "אין כרגע קמפיין תואם. "}
              כל קמפיין חדש ששמו יכיל את הטקסט הזה ייכנס לסקשן אוטומטית.
            </p>
          )}
          {error && <p className="text-xs text-brand-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={close} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted transition-colors duration-200 hover:bg-brand-bg">ביטול</button>
            <button onClick={submit} disabled={saving || !filter.trim()} className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-brand-dark/90 disabled:opacity-50">{saving ? "מוסיף..." : "הוסף סקשן"}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
