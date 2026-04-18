"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, AlertCircle, CheckCircle2, Clock, Filter } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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

const PLATFORM_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  "Meta": { bg: "bg-blue-100", text: "text-blue-700", icon: "M" },
  "Google Ads": { bg: "bg-green-100", text: "text-green-700", icon: "G" },
  "TikTok": { bg: "bg-gray-100", text: "text-gray-700", icon: "T" },
  "אתר": { bg: "bg-purple-100", text: "text-purple-700", icon: "🌐" },
  "אסטרטגיה": { bg: "bg-orange-100", text: "text-orange-700", icon: "📊" },
  "קריאייטיב": { bg: "bg-pink-100", text: "text-pink-700", icon: "🎨" },
};

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const btnPrimary =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function PlatformBadge({ platform }: { platform: string }) {
  const style = PLATFORM_STYLES[platform] || { bg: "bg-brand-bg", text: "text-brand-dark", icon: "?" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span>{style.icon}</span>
      {platform}
    </span>
  );
}

function CampaignChips({ campaignIds, campaigns }: { campaignIds: string[]; campaigns: Campaign[] }) {
  if (!campaignIds.length) return null;
  const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));
  return (
    <div className="flex flex-wrap gap-1.5">
      {campaignIds.map((id) => (
        <span
          key={id}
          className="rounded-full bg-brand-bg px-2 py-0.5 text-xs text-brand-dark border border-brand-border"
        >
          {campaignMap.get(id) || id}
        </span>
      ))}
    </div>
  );
}

export default function OptimizationsTab({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [modalCampaigns, setModalCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newOpt, setNewOpt] = useState({
    date: todayIso(),
    platform: "" as string,
    campaignIds: [] as string[],
    actionTaken: "",
    expectedOutcome: "",
  });
  const [saving, setSaving] = useState(false);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkText, setCheckText] = useState("");

  // פילטרים
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  /* ============ Fetch ============ */
  const fetchOptimizations = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/optimizations`);
      if (res.ok) setOptimizations(await res.json());
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const fetchAllCampaigns = useCallback(async () => {
    // Fetch campaigns for all platforms to resolve names in display
    try {
      const [metaRes, googleRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/campaigns?platform=meta`),
        fetch(`/api/clients/${clientId}/campaigns?platform=google_ads`),
      ]);
      const metaCampaigns = metaRes.ok ? await metaRes.json() : [];
      const googleCampaigns = googleRes.ok ? await googleRes.json() : [];
      setCampaigns([...metaCampaigns, ...googleCampaigns]);
    } catch {
      // silent
    }
  }, [clientId]);

  const fetchCampaigns = useCallback(
    async (platform: string) => {
      if (!PLATFORMS_WITH_CAMPAIGNS.has(platform)) {
        setModalCampaigns([]);
        return;
      }
      setLoadingCampaigns(true);
      try {
        const platformParam = platform === "Meta" ? "meta" : platform === "Google Ads" ? "google_ads" : "";
        const res = await fetch(`/api/clients/${clientId}/campaigns?platform=${platformParam}`);
        if (res.ok) setModalCampaigns(await res.json());
        else setModalCampaigns([]);
      } catch {
        setModalCampaigns([]);
      } finally {
        setLoadingCampaigns(false);
      }
    },
    [clientId]
  );

  useEffect(() => {
    fetchOptimizations();
    fetchAllCampaigns();
  }, [fetchOptimizations, fetchAllCampaigns]);

  /* ============ Derived data ============ */

  // "Waiting for check" — not checked AND at least 3 days old
  const waitingForCheck = useMemo(() => {
    return optimizations.filter((o) => !o.isChecked && o.date && daysBetween(o.date) >= 3);
  }, [optimizations]);

  // History: all optimizations, filtered
  const filteredHistory = useMemo(() => {
    let list = [...optimizations];

    if (filterPlatform !== "all") {
      list = list.filter((o) => o.platform === filterPlatform);
    }
    if (filterStatus === "checked") {
      list = list.filter((o) => o.isChecked);
    } else if (filterStatus === "unchecked") {
      list = list.filter((o) => !o.isChecked);
    }
    if (filterDateFrom) {
      list = list.filter((o) => o.date >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter((o) => o.date <= filterDateTo);
    }

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [optimizations, filterPlatform, filterStatus, filterDateFrom, filterDateTo]);

  /* ============ Actions ============ */
  async function handleCreate() {
    if (!newOpt.actionTaken || !newOpt.date || !newOpt.platform) return;
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/optimizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOpt),
      });
      setNewOpt({ date: todayIso(), platform: "", campaignIds: [], actionTaken: "", expectedOutcome: "" });
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

  function handlePlatformChange(platform: string) {
    setNewOpt((p) => ({ ...p, platform, campaignIds: [] }));
    setModalCampaigns([]);
    if (PLATFORMS_WITH_CAMPAIGNS.has(platform)) {
      fetchCampaigns(platform);
    }
  }

  const showCampaignsDropdown = PLATFORMS_WITH_CAMPAIGNS.has(newOpt.platform);

  if (loading) return <p className="text-sm text-brand-muted">{t("loading")}</p>;

  return (
    <div className="space-y-6">
      {/* ============ Header ============ */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-dark">{t("optimizations")}</h2>
        <button onClick={() => setShowAddModal(true)} className={`inline-flex items-center gap-2 ${btnPrimary}`}>
          <Plus className="h-4 w-4" />
          {t("addOptimization")}
        </button>
      </div>

      {/* ============ Waiting for Check Section ============ */}
      {waitingForCheck.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <h3 className="text-base font-semibold text-brand-dark">{t("toCheck")}</h3>
            <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800">
              {waitingForCheck.length}
            </span>
          </div>

          <div className="space-y-3">
            {waitingForCheck.map((opt) => (
              <div
                key={opt.id}
                className="rounded-lg border border-white bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-brand-muted">{formatDate(opt.date)}</span>
                      <PlatformBadge platform={opt.platform} />
                    </div>
                    <CampaignChips campaignIds={opt.campaignIds} campaigns={campaigns} />
                    <div>
                      <p className="text-xs font-bold text-brand-muted">{t("whatWeDid")}</p>
                      <p className="text-sm text-brand-dark">{opt.actionTaken}</p>
                    </div>
                    {opt.expectedOutcome && (
                      <div>
                        <p className="text-xs font-bold text-brand-muted">{t("whatWeExpect")}</p>
                        <p className="text-sm text-brand-dark">{opt.expectedOutcome}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        <Clock className="h-3 w-3" />
                        {t("toCheck")} ({daysBetween(opt.date)} {t("days") || "ימים"})
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCheckingId(opt.id);
                      setCheckText("");
                    }}
                    className="shrink-0 rounded-lg border border-brand-success bg-brand-success/10 px-3 py-1.5 text-xs font-medium text-brand-success hover:bg-brand-success/20 transition-colors duration-200"
                  >
                    {t("markAsChecked")}
                  </button>
                </div>

                {checkingId === opt.id && (
                  <div className="mt-3 space-y-2 border-t border-brand-border pt-3">
                    <label className="block text-xs font-medium text-brand-dark">{t("whatHappened")}</label>
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={checkText}
                      onChange={(e) => setCheckText(e.target.value)}
                      placeholder={t("whatHappened")}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setCheckingId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs text-brand-muted hover:bg-brand-bg transition-colors duration-200"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        onClick={() => handleMarkChecked(opt.id)}
                        disabled={!checkText.trim()}
                        className="rounded-lg bg-brand-success px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-success/80 disabled:opacity-50 transition-colors duration-200"
                      >
                        {t("save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ Filters ============ */}
      <div className="rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-brand-muted" />
          <h3 className="text-sm font-semibold text-brand-dark">{t("filters") || "סינון"}</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">{t("platform")}</label>
            <select
              className={inputClass}
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
            >
              <option value="all">{t("all") || "הכל"}</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">{t("status")}</label>
            <select
              className={inputClass}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">{t("all") || "הכל"}</option>
              <option value="checked">{t("checked") || "נבדק"}</option>
              <option value="unchecked">{t("toCheck") || "לא נבדק"}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">{t("from") || "מתאריך"}</label>
            <input
              type="date"
              className={inputClass}
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-muted">{t("to") || "עד תאריך"}</label>
            <input
              type="date"
              className={inputClass}
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ============ Timeline History ============ */}
      <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-brand-dark">{t("history")}</h3>
        {filteredHistory.length === 0 ? (
          <p className="text-sm text-brand-muted">{t("noHistory")}</p>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute right-3 top-0 bottom-0 w-0.5 bg-brand-border" />

            <div className="space-y-4">
              {filteredHistory.map((opt) => {
                const platformStyle = PLATFORM_STYLES[opt.platform] || { bg: "bg-brand-bg", text: "text-brand-dark", icon: "?" };
                return (
                  <div key={opt.id} className="relative pr-10">
                    {/* Timeline dot */}
                    <div
                      className={`absolute right-1.5 top-4 h-4 w-4 rounded-full border-2 border-white shadow-sm ${
                        opt.isChecked ? "bg-brand-success" : "bg-orange-400"
                      }`}
                    />

                    {/* Card */}
                    <div className="rounded-lg border border-brand-border bg-white p-4 shadow-sm">
                      {/* Header: date + platform badge */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-brand-muted">{formatDate(opt.date)}</span>
                        <PlatformBadge platform={opt.platform} />
                      </div>

                      {/* Campaign chips */}
                      {opt.campaignIds.length > 0 && (
                        <div className="mb-3">
                          <CampaignChips campaignIds={opt.campaignIds} campaigns={campaigns} />
                        </div>
                      )}

                      {/* What we did */}
                      <div className="mb-2">
                        <p className="text-xs font-bold text-brand-muted">{t("whatWeDid")}</p>
                        <p className="text-sm text-brand-dark">{opt.actionTaken}</p>
                      </div>

                      {/* What we expect */}
                      {opt.expectedOutcome && (
                        <div className="mb-2">
                          <p className="text-xs font-bold text-brand-muted">{t("whatWeExpect")}</p>
                          <p className="text-sm text-brand-dark">{opt.expectedOutcome}</p>
                        </div>
                      )}

                      {/* Checked result or waiting badge */}
                      {opt.isChecked ? (
                        <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />
                            <span className="text-xs font-bold text-brand-success">{t("whatHappened")}</span>
                            {opt.checkedAt && (
                              <span className="text-xs text-brand-muted mr-auto">
                                ({formatDate(opt.checkedAt)})
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-green-800">{opt.actualResult}</p>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                            <Clock className="h-3 w-3" />
                            {t("toCheck")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ============ Add Optimization Modal ============ */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={t("addOptimization")} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">{t("date")}</label>
              <input
                type="date"
                className={inputClass}
                value={newOpt.date}
                onChange={(e) => setNewOpt((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">{t("platform")}</label>
              <select
                className={inputClass}
                value={newOpt.platform}
                onChange={(e) => handlePlatformChange(e.target.value)}
              >
                <option value="">{t("select") || "בחר..."}</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showCampaignsDropdown && newOpt.platform && (
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                {t("campaignsLabel")} <span className="font-normal text-brand-muted">({newOpt.campaignIds.length})</span>
              </label>
              {loadingCampaigns ? (
                <p className="rounded-lg border border-brand-border bg-brand-bg p-3 text-xs text-brand-muted">
                  {t("loading")}
                </p>
              ) : modalCampaigns.length === 0 ? (
                <p className="rounded-lg border border-brand-border bg-brand-bg p-3 text-xs text-brand-muted">
                  {t("noCheckNeeded")}
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-brand-border bg-brand-bg p-2">
                  {modalCampaigns.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-brand-light transition-colors duration-200"
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
            <label className="mb-1 block text-sm font-medium text-brand-dark">{t("whatWeDid")}</label>
            <textarea
              className={inputClass}
              rows={3}
              value={newOpt.actionTaken}
              onChange={(e) => setNewOpt((p) => ({ ...p, actionTaken: e.target.value }))}
              placeholder={t("whatWeDid")}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">{t("whatWeExpect")}</label>
            <textarea
              className={inputClass}
              rows={3}
              value={newOpt.expectedOutcome}
              onChange={(e) => setNewOpt((p) => ({ ...p, expectedOutcome: e.target.value }))}
              placeholder={t("whatWeExpect")}
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="rounded-lg px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg transition-colors duration-200"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !newOpt.actionTaken || !newOpt.platform}
              className={`${btnPrimary} disabled:opacity-50`}
            >
              {saving ? t("loading") : t("add")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
