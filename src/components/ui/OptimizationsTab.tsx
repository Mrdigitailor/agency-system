"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

export interface Optimization {
  id: string;
  date: string;
  platform: string;
  campaignIds: string[];
  actionTaken: string;
  expectedOutcome: string;
  isChecked: boolean;
  checkedAt: string | null;
  actualResult: string;
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
}

const PLATFORMS = ["Meta", "Google Ads", "TikTok", "אתר", "אסטרטגיה", "קריאייטיב"] as const;
const PLATFORMS_WITH_CAMPAIGNS = new Set(["Meta", "Google Ads", "TikTok"]);

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const btnPrimary =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";
const cardClass = "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function OptimizationsTab({ clientId }: { clientId: string }) {
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newOpt, setNewOpt] = useState({
    date: todayIso(),
    platform: "Meta",
    campaignIds: [] as string[],
    actionTaken: "",
    expectedOutcome: "",
  });
  const [saving, setSaving] = useState(false);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkText, setCheckText] = useState("");

  const fetchOptimizations = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/optimizations`);
      if (res.ok) setOptimizations(await res.json());
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/campaigns`);
      if (res.ok) setCampaigns(await res.json());
    } catch {}
  }, [clientId]);

  useEffect(() => {
    fetchOptimizations();
    fetchCampaigns();
  }, [fetchOptimizations, fetchCampaigns]);

  // אופטימיזציות "לבדיקה" — בוצעו ב-14 ימים האחרונים, לא נבדקו
  const toCheck = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return optimizations.filter((o) => !o.isChecked && o.date && new Date(o.date).getTime() >= cutoff);
  }, [optimizations]);

  const checked = useMemo(() => optimizations.filter((o) => o.isChecked), [optimizations]);
  const olderUnchecked = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return optimizations.filter((o) => !o.isChecked && o.date && new Date(o.date).getTime() < cutoff);
  }, [optimizations]);

  /* ============ פעולות ============ */
  async function handleCreate() {
    if (!newOpt.actionTaken || !newOpt.date) return;
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/optimizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOpt),
      });
      setNewOpt({ date: todayIso(), platform: "Meta", campaignIds: [], actionTaken: "", expectedOutcome: "" });
      setShowAddModal(false);
      await fetchOptimizations();
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkChecked(optId: string) {
    if (!checkText.trim()) return;
    await fetch(`/api/clients/${clientId}/optimizations/${optId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isChecked: true, actualResult: checkText.trim() }),
    });
    setCheckingId(null);
    setCheckText("");
    await fetchOptimizations();
  }

  function toggleCampaign(campaignId: string) {
    setNewOpt((p) => ({
      ...p,
      campaignIds: p.campaignIds.includes(campaignId)
        ? p.campaignIds.filter((c) => c !== campaignId)
        : [...p.campaignIds, campaignId],
    }));
  }

  const showCampaignsDropdown = PLATFORMS_WITH_CAMPAIGNS.has(newOpt.platform);

  if (loading) return <p className="text-sm text-brand-muted">טוען...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-dark">אופטימיזציות</h2>
        <button onClick={() => setShowAddModal(true)} className={`inline-flex items-center gap-2 ${btnPrimary}`}>
          <Plus className="h-4 w-4" />
          הוסף אופטימיזציה
        </button>
      </div>

      {/* ============ סקשן: אופטימיזציות לבדיקה ============ */}
      <div className={cardClass}>
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-brand-warning" />
          <h3 className="text-base font-semibold text-brand-dark">אופטימיזציות לבדיקה</h3>
          <span className="rounded-full bg-brand-warning/20 px-2 py-0.5 text-xs font-medium text-brand-warning">
            {toCheck.length}
          </span>
        </div>

        {toCheck.length === 0 ? (
          <p className="text-sm text-brand-muted">אין אופטימיזציות שממתינות לבדיקה.</p>
        ) : (
          <div className="space-y-3">
            {toCheck.map((opt) => (
              <div key={opt.id} className="rounded-lg border border-brand-warning/30 bg-brand-warning/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-brand-muted">{formatDate(opt.date)}</span>
                      {opt.platform && (
                        <span className="rounded-full bg-brand-bg px-2 py-0.5 text-xs font-medium text-brand-dark">
                          {opt.platform}
                        </span>
                      )}
                      {opt.campaignIds.length > 0 && (
                        <span className="text-xs text-brand-muted">
                          {opt.campaignIds.length} קמפיינים: {opt.campaignIds.slice(0, 2).join(", ")}
                          {opt.campaignIds.length > 2 && "..."}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-brand-muted">מה ביצענו</p>
                      <p className="text-sm text-brand-dark">{opt.actionTaken}</p>
                    </div>
                    {opt.expectedOutcome && (
                      <div>
                        <p className="text-xs font-medium text-brand-muted">מה ציפינו לקבל</p>
                        <p className="text-sm text-brand-dark">{opt.expectedOutcome}</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setCheckingId(opt.id);
                      setCheckText("");
                    }}
                    className="shrink-0 rounded-lg border border-brand-success bg-brand-success/10 px-3 py-1.5 text-xs font-medium text-brand-success hover:bg-brand-success/20"
                  >
                    סמן כנבדק
                  </button>
                </div>

                {checkingId === opt.id && (
                  <div className="mt-3 space-y-2 border-t border-brand-warning/30 pt-3">
                    <label className="block text-xs font-medium text-brand-dark">מה קרה בפועל?</label>
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={checkText}
                      onChange={(e) => setCheckText(e.target.value)}
                      placeholder="סכם את התוצאה בפועל..."
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setCheckingId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs text-brand-muted hover:bg-brand-bg"
                      >
                        ביטול
                      </button>
                      <button
                        onClick={() => handleMarkChecked(opt.id)}
                        disabled={!checkText.trim()}
                        className="rounded-lg bg-brand-success px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-success/80 disabled:opacity-50"
                      >
                        שמור
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ סקשן: היסטוריה (נבדקו + ישנים שלא נבדקו) ============ */}
      <div className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-brand-dark">היסטוריה</h3>
        {checked.length === 0 && olderUnchecked.length === 0 ? (
          <p className="text-sm text-brand-muted">אין אופטימיזציות בהיסטוריה.</p>
        ) : (
          <div className="space-y-4">
            {[...checked, ...olderUnchecked]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((opt) => (
                <div key={opt.id} className="border-r-2 border-brand-gold pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-brand-muted">{formatDate(opt.date)}</p>
                    {opt.platform && (
                      <span className="rounded-full bg-brand-bg px-2 py-0.5 text-xs text-brand-muted">{opt.platform}</span>
                    )}
                    {opt.isChecked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-xs font-medium text-brand-success">
                        <CheckCircle2 className="h-3 w-3" />
                        נבדק
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-brand-dark">
                    <span className="font-medium">מה ביצענו: </span>
                    {opt.actionTaken}
                  </p>
                  {opt.expectedOutcome && (
                    <p className="text-xs text-brand-muted">
                      <span className="font-medium">ציפינו: </span>
                      {opt.expectedOutcome}
                    </p>
                  )}
                  {opt.isChecked && opt.actualResult && (
                    <p className="mt-1 text-xs text-brand-success">
                      <span className="font-medium">בפועל: </span>
                      {opt.actualResult}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ============ מודל הוספת אופטימיזציה ============ */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="הוסף אופטימיזציה" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">תאריך</label>
              <input
                type="date"
                className={inputClass}
                value={newOpt.date}
                onChange={(e) => setNewOpt((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">פלטפורמה</label>
              <select
                className={inputClass}
                value={newOpt.platform}
                onChange={(e) => setNewOpt((p) => ({ ...p, platform: e.target.value, campaignIds: [] }))}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showCampaignsDropdown && (
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                קמפיינים <span className="font-normal text-brand-muted">({newOpt.campaignIds.length} נבחרו)</span>
              </label>
              {campaigns.length === 0 ? (
                <p className="rounded-lg border border-brand-border bg-brand-bg p-3 text-xs text-brand-muted">
                  אין קמפיינים זמינים. ודא שיש סנכרון נתונים מ-Meta.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-brand-border bg-brand-bg p-2">
                  {campaigns.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-brand-light"
                    >
                      <input
                        type="checkbox"
                        checked={newOpt.campaignIds.includes(c.id)}
                        onChange={() => toggleCampaign(c.id)}
                        className="h-4 w-4 rounded border-brand-border"
                      />
                      <span className="text-sm text-brand-dark">{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">מה ביצענו?</label>
            <textarea
              className={inputClass}
              rows={3}
              value={newOpt.actionTaken}
              onChange={(e) => setNewOpt((p) => ({ ...p, actionTaken: e.target.value }))}
              placeholder="תיאור הפעולה שנעשתה..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">מה אנחנו מצפים לקבל?</label>
            <textarea
              className={inputClass}
              rows={3}
              value={newOpt.expectedOutcome}
              onChange={(e) => setNewOpt((p) => ({ ...p, expectedOutcome: e.target.value }))}
              placeholder="המטרה / הציפייה מהשינוי..."
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="rounded-lg px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg"
            >
              ביטול
            </button>
            <button onClick={handleCreate} disabled={saving || !newOpt.actionTaken} className={`${btnPrimary} disabled:opacity-50`}>
              {saving ? "שומר..." : "הוסף"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
