"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Trash2, PauseCircle, AlertTriangle, Search, ChevronUp, ChevronDown, ChevronsUpDown, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import ProgressBar from "@/components/ui/ProgressBar";
import DateRangePicker, { getPresetRange, type DateRange } from "@/components/ui/DateRangePicker";
import { useApp } from "@/lib/data/context";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PLATFORMS, CLIENT_TYPES, CLIENT_STATUSES, type Client } from "@/lib/data/types";
import { getCampaignManagerForClient, getAccountManagerForClient } from "@/lib/utils/resolveManagers";
import { CURRENCIES, getCurrencySymbol } from "@/lib/utils/currency";

function getStatusInfo(status: string) {
  return CLIENT_STATUSES.find((s) => s.value === status) ?? CLIENT_STATUSES[0];
}
function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function daysLeftInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

export default function ClientsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { clients, addClient, employees, refreshClients } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("this_month"));

  // רענן לקוחות כשמשנים תאריכים
  useEffect(() => {
    refreshClients(dateRange.since, dateRange.until);
  }, [dateRange.since, dateRange.until, refreshClients]);
  const campaigners = employees.filter((e) => e.role === "campaignManager" || e.role === "admin");
  const managers = employees.filter((e) => e.role === "manager" || e.role === "admin");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // סינונים
  const [searchText, setSearchText] = useState("");
  const [filterCM, setFilterCM] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // מיון
  type SortCol = "name" | "cm" | "budget" | "spend" | "conversions" | "cpa" | "status";
  type SortDir = "asc" | "desc" | null;
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function toggleSort(col: SortCol) {
    if (sortCol !== col) { setSortCol(col); setSortDir("desc"); }
    else if (sortDir === "desc") setSortDir("asc");
    else { setSortCol(null); setSortDir(null); }
  }

  const remaining = daysLeftInMonth();

  const filteredAndSorted = useMemo(() => {
    let result = [...clients];

    // סינון חיפוש
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    // סינון מנהל קמפיינים
    if (filterCM !== "all") {
      result = result.filter((c) => getCampaignManagerForClient(c.id, employees) === filterCM);
    }

    // סינון סטטוס
    if (filterStatus !== "all") {
      result = result.filter((c) => c.status === filterStatus);
    }

    // מיון
    if (sortCol && sortDir) {
      result.sort((a, b) => {
        let va: number | string = 0;
        let vb: number | string = 0;
        switch (sortCol) {
          case "name": va = a.name; vb = b.name; break;
          case "cm": va = getCampaignManagerForClient(a.id, employees) ?? ""; vb = getCampaignManagerForClient(b.id, employees) ?? ""; break;
          case "budget": va = a.monthlyBudget; vb = b.monthlyBudget; break;
          case "spend": va = a.currentMonthSpend ?? a.performance.budgetUsed ?? 0; vb = b.currentMonthSpend ?? b.performance.budgetUsed ?? 0; break;
          case "conversions": va = a.currentMonthConversions ?? a.performance.conversionsThisMonth ?? 0; vb = b.currentMonthConversions ?? b.performance.conversionsThisMonth ?? 0; break;
          case "cpa": va = a.currentMonthCostPerConv ?? a.performance.avgCostPerConversion ?? 0; vb = b.currentMonthCostPerConv ?? b.performance.avgCostPerConversion ?? 0; break;
          case "status": va = a.status; vb = b.status; break;
        }
        if (typeof va === "string" && typeof vb === "string") {
          return sortDir === "asc" ? va.localeCompare(vb, "he") : vb.localeCompare(va, "he");
        }
        return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
      });
    }

    return result;
  }, [clients, searchText, filterCM, filterStatus, sortCol, sortDir, employees]);

  const hasFilters = searchText || filterCM !== "all" || filterStatus !== "all";

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown className="inline h-3 w-3 text-brand-muted" />;
    if (sortDir === "desc") return <ChevronDown className="inline h-3 w-3 text-brand-gold" />;
    return <ChevronUp className="inline h-3 w-3 text-brand-gold" />;
  }

  // תפריט 3 נקודות
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // מודל אישור מחיקה
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // סגירת תפריט בלחיצה בחוץ
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDeactivate = async (id: string) => {
    await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paused" }) });
    await refreshClients();
    setOpenMenuId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await fetch(`/api/clients/${deleteTarget.id}`, { method: "DELETE" });
    await refreshClients();
    setDeleting(false);
    setDeleteTarget(null);
  };
  const [form, setForm] = useState({
    name: "", manager: "", campaignManager: "", accountManager: "", platforms: [] as string[],
    monthlyBudget: "", currency: "ILS", clientType: CLIENT_TYPES[0] as string, status: "active" as Client["status"],
    contactEmail: "", contactPhone: "", notes: "",
    metaAdAccount: "", googleAdAccount: "", tiktokAdAccount: "",
    facebookPage: "", instagram: "", linkedin: "", website: "",
    targetCostPerConversion: "", targetConversions: "",
  });

  const handlePlatformToggle = (p: string) => {
    setForm((prev) => ({ ...prev, platforms: prev.platforms.includes(p) ? prev.platforms.filter((x) => x !== p) : [...prev.platforms, p] }));
  };

  const resetForm = () => {
    setForm({ name: "", manager: "", campaignManager: "", accountManager: "", platforms: [], monthlyBudget: "", currency: "ILS", clientType: CLIENT_TYPES[0] as string, status: "active", contactEmail: "", contactPhone: "", notes: "", metaAdAccount: "", googleAdAccount: "", tiktokAdAccount: "", facebookPage: "", instagram: "", linkedin: "", website: "", targetCostPerConversion: "", targetConversions: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    addClient({
      name: form.name, manager: form.campaignManager || form.accountManager, campaignManager: form.campaignManager, accountManager: form.accountManager, platforms: form.platforms,
      monthlyBudget: Number(form.monthlyBudget) || 0, currency: form.currency, metaConversionEvent: "", clientType: form.clientType,
      status: form.status, contactEmail: form.contactEmail, contactPhone: form.contactPhone, notes: form.notes,
      digitalAssets: { metaAdAccount: form.metaAdAccount, googleAdAccount: form.googleAdAccount, tiktokAdAccount: form.tiktokAdAccount, facebookPage: form.facebookPage, instagram: form.instagram, linkedin: form.linkedin, website: form.website },
      performance: { budgetUsed: 0, avgCostPerConversion: 0, targetCostPerConversion: Number(form.targetCostPerConversion) || 0, conversionsThisMonth: 0, targetConversions: Number(form.targetConversions) || 0, lastOptimization: "" },
      customAssets: [],
    });
    resetForm();
    setIsModalOpen(false);
  };

  const inputClass = "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-brand-dark">{t('clients')}</h1>
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
            <Plus className="h-4 w-4" />
            {t('newClient')}
          </button>
        </div>
      </div>

      {/* סרגל סינון */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-border bg-brand-light p-3 shadow-sm">
        <div className="relative flex-1 min-w-[180px] max-w-[300px]">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('searchByName')}
            className="w-full rounded-lg border border-brand-border bg-brand-bg pr-9 pl-3 py-1.5 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:outline-none"
          />
        </div>
        <select value={filterCM} onChange={(e) => setFilterCM(e.target.value)} className="rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
          <option value="all">{`${t('campaignManager')}: ${t('all')}`}</option>
          {campaigners.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-brand-border bg-brand-bg px-3 py-1.5 text-sm text-brand-dark focus:border-brand-gold focus:outline-none">
          <option value="all">{`${t('status')}: ${t('all')}`}</option>
          {CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearchText(""); setFilterCM("all"); setFilterStatus("all"); setSortCol(null); setSortDir(null); }} className="flex items-center gap-1 rounded-lg border border-brand-border px-3 py-1.5 text-xs text-brand-muted hover:bg-brand-bg">
            <X className="h-3 w-3" />
            {t('clearFilters')}
          </button>
        )}
        <span className="text-xs text-brand-muted">{filteredAndSorted.length} {t('clientsCount')}</span>
      </div>

      <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/50">
                <th className="px-4 py-3 text-right font-medium text-brand-muted cursor-pointer select-none" onClick={() => toggleSort("name")}>{t('name')} <SortIcon col="name" /></th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted cursor-pointer select-none" onClick={() => toggleSort("cm")}>{t('campaignManager')} <SortIcon col="cm" /></th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('accountManager')}</th>
                <th className="min-w-[180px] px-4 py-3 text-right font-medium text-brand-muted cursor-pointer select-none" onClick={() => toggleSort("budget")}>{t('budget')} <SortIcon col="budget" /></th>
                <th className="min-w-[160px] px-4 py-3 text-right font-medium text-brand-muted cursor-pointer select-none" onClick={() => toggleSort("cpa")}>{t('costPerConversion')} <SortIcon col="cpa" /></th>
                <th className="min-w-[160px] px-4 py-3 text-right font-medium text-brand-muted cursor-pointer select-none" onClick={() => toggleSort("conversions")}>{t('conversions')} <SortIcon col="conversions" /></th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('optimization')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">{t('lastSync')}</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted cursor-pointer select-none" onClick={() => toggleSort("status")}>{t('status')} <SortIcon col="status" /></th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSorted.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-brand-muted">{hasFilters ? t('noMatchingClients') : t('noClients')}</td></tr>
              )}
              {filteredAndSorted.map((client) => {
                const statusInfo = getStatusInfo(client.status);
                const { performance: p } = client;
                // spend אמיתי מ-Meta (אם יש), אחרת הערך הידני
                const actualSpend = client.currentMonthSpend ?? p.budgetUsed ?? 0;
                const budgetPct = client.monthlyBudget > 0 ? Math.round((actualSpend / client.monthlyBudget) * 100) : 0;
                const convPct = p.targetConversions > 0 ? Math.round((p.conversionsThisMonth / p.targetConversions) * 100) : 0;
                const sym = getCurrencySymbol(client.currency);
                return (
                  <tr key={client.id} onClick={() => router.push(`/clients/${client.id}`)} className="cursor-pointer border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg/30">
                    <td className="px-4 py-4 font-medium text-brand-dark">{client.name}</td>
                    <td className="px-4 py-4 text-brand-muted">{getCampaignManagerForClient(client.id, employees) || "—"}</td>
                    <td className="px-4 py-4 text-brand-muted">{getAccountManagerForClient(client.id, employees) || "—"}</td>
                    {/* תקציב */}
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-brand-dark font-medium">{sym}{Math.round(actualSpend).toLocaleString()}</span>
                          <span className="text-brand-muted">/ {sym}{client.monthlyBudget.toLocaleString()}</span>
                        </div>
                        <ProgressBar current={actualSpend} target={client.monthlyBudget} inverted />
                        <div className="flex justify-between text-[10px] text-brand-muted">
                          <span>{budgetPct}% {t('used')}</span>
                          <span>{remaining} {t('daysRemaining')}</span>
                        </div>
                      </div>
                    </td>
                    {/* עלות להמרה */}
                    <td className="px-4 py-4">
                      {(client.currentMonthCostPerConv ?? 0) > 0 || p.targetCostPerConversion > 0 ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-brand-dark font-medium">{(client.currentMonthCostPerConv ?? 0) > 0 ? `${sym}${Math.round(client.currentMonthCostPerConv ?? 0)}` : "—"}</span>
                            {p.targetCostPerConversion > 0 && <span className="text-brand-muted">{`${t('target')}:`} {sym}{p.targetCostPerConversion}</span>}
                          </div>
                          {(client.currentMonthCostPerConv ?? 0) > 0 && p.targetCostPerConversion > 0 && (
                            <ProgressBar current={client.currentMonthCostPerConv ?? 0} target={p.targetCostPerConversion} inverted />
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-brand-muted">—</span>
                      )}
                    </td>
                    {/* המרות */}
                    <td className="px-4 py-4">
                      {(client.currentMonthConversions ?? 0) > 0 || p.targetConversions > 0 ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-brand-dark font-medium">{(client.currentMonthConversions ?? 0).toLocaleString()}</span>
                            <span className="text-brand-muted">{`${t('target')}:`} {p.targetConversions.toLocaleString()}</span>
                          </div>
                          <ProgressBar current={client.currentMonthConversions ?? 0} target={p.targetConversions} />
                          <div className="text-[10px] text-brand-muted">
                            {p.targetConversions > 0 ? Math.round(((client.currentMonthConversions ?? 0) / p.targetConversions) * 100) : 0}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-brand-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-brand-muted">{formatDate(p.lastOptimization)}</td>
                    <td className="px-4 py-4">
                      {(() => {
                        const syncs = client.platformSyncs;
                        if (!syncs || syncs.length === 0) return <span className="text-xs text-brand-muted">—</span>;
                        const dates = syncs.filter((s) => s.lastSyncAt).map((s) => new Date(s.lastSyncAt!));
                        if (dates.length === 0) return <span className="text-xs text-brand-muted">—</span>;
                        const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
                        const now = new Date();
                        const diffH = (now.getTime() - oldest.getTime()) / (1000 * 60 * 60);
                        const timeStr = oldest.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
                        const dateStr = oldest.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
                        const isToday = oldest.toDateString() === now.toDateString();
                        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
                        const isYesterday = oldest.toDateString() === yesterday.toDateString();
                        const color = isToday ? "text-brand-success" : isYesterday ? "text-brand-warning" : "text-brand-danger";
                        const label = isToday ? timeStr : isYesterday ? `אתמול ${timeStr}` : `${dateStr} ${timeStr}`;
                        const tooltip = syncs.map((s) => `${s.platform}: ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}`).join("\n");
                        return <span className={`text-xs font-medium ${color}`} title={tooltip}>{label}</span>;
                      })()}
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-bg px-2.5 py-1 text-xs font-medium">
                        <span className={`h-2 w-2 rounded-full ${statusInfo.color}`} />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="relative" ref={openMenuId === client.id ? menuRef : null}>
                        <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === client.id ? null : client.id); }} className="rounded-lg p-1 text-brand-muted hover:bg-brand-bg hover:text-brand-dark">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openMenuId === client.id && (
                          <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-brand-border bg-brand-light py-1 shadow-lg">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeactivate(client.id); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
                            >
                              <PauseCircle className="h-4 w-4" />
                              {t('deactivateClient')}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: client.id, name: client.name }); setOpenMenuId(null); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-brand-danger hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              {t('deleteClient')}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* מודל לקוח חדש */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t('newClient')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-brand-dark">פרטים כלליים</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-brand-dark">שם הלקוח</label>
                <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} placeholder="הזן שם לקוח" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">מנהל קמפיינים</label>
                <select value={form.campaignManager} onChange={(e) => setForm((p) => ({ ...p, campaignManager: e.target.value }))} className={inputClass}>
                  <option value="">בחר מנהל קמפיינים</option>
                  {campaigners.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">מנהל תיקים / סמנכ״ל</label>
                <select value={form.accountManager} onChange={(e) => setForm((p) => ({ ...p, accountManager: e.target.value }))} className={inputClass}>
                  <option value="">בחר מנהל תיקים</option>
                  {managers.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">סוג לקוח</label>
                <select value={form.clientType} onChange={(e) => setForm((p) => ({ ...p, clientType: e.target.value }))} className={inputClass}>
                  {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-brand-dark">פלטפורמות</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button key={p} type="button" onClick={() => handlePlatformToggle(p)} className={`rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 ${form.platforms.includes(p) ? "border-brand-gold bg-brand-gold/20 text-brand-dark" : "border-brand-border bg-brand-bg text-brand-muted hover:border-brand-gold"}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">תקציב חודשי (₪)</label><input type="number" value={form.monthlyBudget} onChange={(e) => setForm((p) => ({ ...p, monthlyBudget: e.target.value }))} className={inputClass} placeholder="0" /></div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">מטבע</label>
                <select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} className={inputClass}>
                  {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">סטטוס</label><select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Client["status"] }))} className={inputClass}>{CLIENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">אימייל</label><input type="email" value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} className={inputClass} placeholder="email@example.com" /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">טלפון</label><input type="tel" value={form.contactPhone} onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))} className={inputClass} placeholder="03-0000000" /></div>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-brand-dark">יעדים</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">יעד עלות להמרה (₪)</label><input type="number" value={form.targetCostPerConversion} onChange={(e) => setForm((p) => ({ ...p, targetCostPerConversion: e.target.value }))} className={inputClass} placeholder="0" /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">יעד מספר המרות</label><input type="number" value={form.targetConversions} onChange={(e) => setForm((p) => ({ ...p, targetConversions: e.target.value }))} className={inputClass} placeholder="0" /></div>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-brand-dark">נכסים דיגיטליים</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">חשבון Meta Ads</label><input type="url" value={form.metaAdAccount} onChange={(e) => setForm((p) => ({ ...p, metaAdAccount: e.target.value }))} className={inputClass} placeholder="https://business.facebook.com/adsmanager/manage/accounts?act=..." /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">חשבון Google Ads</label><input type="url" value={form.googleAdAccount} onChange={(e) => setForm((p) => ({ ...p, googleAdAccount: e.target.value }))} className={inputClass} placeholder="https://ads.google.com/aw/overview?ocid=..." /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">חשבון TikTok Ads</label><input type="url" value={form.tiktokAdAccount} onChange={(e) => setForm((p) => ({ ...p, tiktokAdAccount: e.target.value }))} className={inputClass} placeholder="https://ads.tiktok.com/i18n/account/info?aadvid=..." /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">אתר</label><input type="url" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} className={inputClass} placeholder="https://" /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">פייסבוק</label><input type="url" value={form.facebookPage} onChange={(e) => setForm((p) => ({ ...p, facebookPage: e.target.value }))} className={inputClass} placeholder="https://facebook.com/..." /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">אינסטגרם</label><input type="url" value={form.instagram} onChange={(e) => setForm((p) => ({ ...p, instagram: e.target.value }))} className={inputClass} placeholder="https://instagram.com/..." /></div>
              <div><label className="mb-1 block text-sm font-medium text-brand-dark">לינקדאין</label><input type="url" value={form.linkedin} onChange={(e) => setForm((p) => ({ ...p, linkedin: e.target.value }))} className={inputClass} placeholder="https://linkedin.com/..." /></div>
            </div>
          </div>
          <div><label className="mb-1 block text-sm font-medium text-brand-dark">הערות</label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className={inputClass} placeholder="הערות נוספות..." /></div>
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg">{t('cancel')}</button>
            <button type="submit" className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80">{t('save')}</button>
          </div>
        </form>
      </Modal>

      {/* מודל אישור מחיקה */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="מחיקת לקוח" size="sm">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4">
            <AlertTriangle className="h-6 w-6 shrink-0 text-brand-danger" />
            <div>
              <p className="text-sm font-medium text-brand-danger">האם אתה בטוח?</p>
              <p className="mt-1 text-sm text-brand-muted">
                הלקוח <strong className="text-brand-dark">{deleteTarget?.name}</strong> יימחק מהמערכת. פעולה זו לא ניתנת לביטול.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg">
              ביטול
            </button>
            <button onClick={handleDelete} disabled={deleting} className="rounded-lg bg-brand-danger px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50">
              {deleting ? "מוחק..." : "אשר מחיקה"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
