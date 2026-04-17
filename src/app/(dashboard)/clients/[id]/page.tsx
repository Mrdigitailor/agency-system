"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Mail,
  Phone,
  Calendar,
  Globe,
  ExternalLink,
  TrendingUp,
  Zap,
  Plus,
  MessageSquare,
  BarChart3,
  ListTodo,
  Monitor,
  Target,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Modal from "@/components/ui/Modal";
import ProgressBar from "@/components/ui/ProgressBar";
import PlatformConnections from "@/components/ui/PlatformConnections";
import ConversionEventSelector from "@/components/ui/ConversionEventSelector";
import MetaCampaignsTab from "@/components/ui/MetaCampaignsTab";
import GoogleAdsCampaignsTab from "@/components/ui/GoogleAdsCampaignsTab";
import MetaPerformanceTab from "@/components/ui/MetaPerformanceTab";
import MessagesTab from "@/components/ui/MessagesTab";
import ClientIdentityTab from "@/components/ui/ClientIdentityTab";
import QuickProfileCard from "@/components/ui/QuickProfileCard";
import AiChatTab from "@/components/ui/AiChatTab";
import MonthPerformanceKpis from "@/components/ui/MonthPerformanceKpis";
import OptimizationsTab from "@/components/ui/OptimizationsTab";
import CreativesTab from "@/components/ui/CreativesTab";
import { useApp } from "@/lib/data/context";
import { getCampaignManagerForClient, getAccountManagerForClient } from "@/lib/utils/resolveManagers";
import { CLIENT_STATUSES, PRIORITIES, TASK_STATUSES, CLIENT_TYPES, type CustomAsset } from "@/lib/data/types";
import { CURRENCIES, getCurrencySymbol } from "@/lib/utils/currency";
import { useLanguage } from "@/lib/i18n/LanguageContext";

/* ==================== עזרים ==================== */

function getStatusInfo(status: string) {
  return CLIENT_STATUSES.find((s) => s.value === status) ?? CLIENT_STATUSES[0];
}
function getPriorityInfo(priority: string) {
  return PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[1];
}
function getTaskStatusInfo(status: string) {
  return TASK_STATUSES.find((s) => s.value === status) ?? TASK_STATUSES[0];
}
function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ==================== קבועים ==================== */

const TAB_DEFS = [
  { id: "overview", heLabel: "סקירה כללית", tKey: "overview", icon: Target },
  { id: "identity", heLabel: "תעודת זהות", tKey: "identity", icon: FileText },
  { id: "campaigns", heLabel: "קמפיינים", tKey: "campaigns", icon: Monitor },
  { id: "performance", heLabel: "ביצועים", tKey: "performance", icon: TrendingUp },
  { id: "optimizations", heLabel: "אופטימיזציות", tKey: "optimizations", icon: Zap },
  { id: "creatives", heLabel: "קריאייטיבים", tKey: "creatives", icon: Monitor },
  { id: "reports", heLabel: "דוחות", tKey: "reportsList", icon: FileText },
  { id: "messages", heLabel: "הודעות", tKey: "messages", icon: MessageSquare },
  { id: "analytics", heLabel: "אנליטיקס", tKey: "analytics", icon: BarChart3 },
  { id: "tasks", heLabel: "משימות", tKey: "tasksList", icon: ListTodo },
  { id: "ai", heLabel: "צ׳אט AI", tKey: "aiChat", icon: BarChart3 },
] as const;

// keep tabs type for backward compat
const tabs = TAB_DEFS;

type TabId = (typeof tabs)[number]["id"];

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

const btnPrimary =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";

const cardClass =
  "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: "active" | "paused";
  dailyBudget: number;
  spent: number;
  conversions: number;
  costPerConversion: number;
  roas: number;
}

const seedCampaigns: Campaign[] = [
  {
    id: "camp1",
    name: "קמפיין לידים ראשי",
    platform: "Meta",
    status: "active",
    dailyBudget: 500,
    spent: 12400,
    conversions: 312,
    costPerConversion: 39.7,
    roas: 4.2,
  },
  {
    id: "camp2",
    name: "חיפוש - מוצר חדש",
    platform: "Google Ads",
    status: "active",
    dailyBudget: 300,
    spent: 8200,
    conversions: 156,
    costPerConversion: 52.6,
    roas: 3.1,
  },
  {
    id: "camp3",
    name: "רימרקטינג",
    platform: "Meta",
    status: "paused",
    dailyBudget: 200,
    spent: 4100,
    conversions: 98,
    costPerConversion: 41.8,
    roas: 5.8,
  },
];

const winningAds = [
  { name: "מודעת וידאו — לידים", ctr: "3.2%", conversions: 87, costPerConversion: 34.5 },
  { name: "קרוסלה — מוצר חדש", ctr: "2.8%", conversions: 64, costPerConversion: 41.2 },
  { name: "סטורי — רימרקטינג", ctr: "4.1%", conversions: 52, costPerConversion: 29.8 },
];

/* ==================== דף לקוח ==================== */

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { t, lang } = useLanguage();
  const { getClient, tasks, addTask, addTaskNote, clients, employees, settings, updateClient } = useApp();
  const client = getClient(params.id as string);

  // נתוני ביצועים מ-Meta (החודש הנוכחי)
  const [metaPerf, setMetaPerf] = useState<{ totalSpend: number; totalConversions: number; avgCostPerConv: number; hasMetaData: boolean; lastOptimization: string | null; metaSpend?: number; metaConversions?: number; gadsSpend?: number; gadsConversions?: number } | null>(null);
  useEffect(() => {
    if (!client?.id) return;
    fetch(`/api/clients/${client.id}/performance`).then((r) => r.json()).then(setMetaPerf).catch(() => {});
  }, [client?.id]);

  const [activeTab, setActiveTab] = useState<TabId>("overview");

  /* קמפיינים — מצב מקומי */
  const [campaigns, setCampaigns] = useState<Campaign[]>(seedCampaigns);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", platform: "Meta", dailyBudget: "" });

  /* משימות — מודל */
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    assignee: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    dueDate: "",
    status: "pending" as "pending" | "in_progress" | "done",
    taskType: "advertising" as "advertising" | "other",
    platform: "",
  });

  /* מודל עריכת לקוח */
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    campaignManager: "",
    accountManager: "",
    clientType: "",
    status: "active" as "active" | "at_risk" | "upsell",
    monthlyBudget: "" as string | number,
    currency: "ILS",
    contactEmail: "",
    contactPhone: "",
    notes: "",
    metaAdAccount: "",
    googleAdAccount: "",
    tiktokAdAccount: "",
    facebookPage: "",
    instagram: "",
    linkedin: "",
    website: "",
    customAssets: [] as CustomAsset[],
    targetConversions: "" as string | number,
    targetCostPerConversion: "" as string | number,
  });

  useEffect(() => {
    const c = getClient(params.id as string);
    if (c && isEditOpen) {
      setEditForm({
        name: c.name,
        campaignManager: c.campaignManager,
        accountManager: c.accountManager,
        clientType: c.clientType,
        status: c.status,
        monthlyBudget: c.monthlyBudget,
        currency: c.currency ?? "ILS",
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        notes: c.notes,
        metaAdAccount: c.digitalAssets.metaAdAccount,
        googleAdAccount: c.digitalAssets.googleAdAccount,
        tiktokAdAccount: c.digitalAssets.tiktokAdAccount,
        facebookPage: c.digitalAssets.facebookPage,
        instagram: c.digitalAssets.instagram,
        linkedin: c.digitalAssets.linkedin,
        website: c.digitalAssets.website,
        customAssets: c.customAssets ?? [],
        targetConversions: c.performance.targetConversions,
        targetCostPerConversion: c.performance.targetCostPerConversion,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditOpen, params.id]);

  /* גרף ביצועים */
  const demoChartData = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 29 + i);
        return {
          date: d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }),
          conversions: Math.floor(20 + Math.random() * 30),
          costPerConversion: Math.floor(30 + Math.random() * 40),
          dailySpend: Math.floor(800 + Math.random() * 600),
          plannedSpend: 1000,
        };
      }),
    [],
  );

  /* ==================== לקוח לא קיים ==================== */

  if (!client) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-brand-muted">הלקוח לא נמצא</p>
          <button
            onClick={() => router.push("/clients")}
            className={`mt-4 ${btnPrimary}`}
          >
            חזרה לרשימת לקוחות
          </button>
        </div>
      </div>
    );
  }

  /* ==================== נתונים נגזרים ==================== */

  const clientTasks = tasks.filter((t) => t.clientId === client.id);
  const statusInfo = getStatusInfo(client.status);
  const { performance: perf, digitalAssets: assets } = client;

  const assetLinks = [
    { label: "עמוד פייסבוק", url: assets.facebookPage, color: "#1877F2", icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
    { label: "אינסטגרם", url: assets.instagram, color: "#E4405F", icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#E4405F"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> },
    { label: "לינקדאין", url: assets.linkedin, color: "#0A66C2", icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> },
    { label: "אתר", url: assets.website, color: "#666", icon: <Globe className="h-5 w-5 text-brand-muted" /> },
  ].filter((a) => a.url);

  const adAccounts = [
    { label: "Meta Ads", value: assets.metaAdAccount, icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#0081FB"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/></svg> },
    { label: "Google Ads", value: assets.googleAdAccount, icon: <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" fill="#4285F4"/></svg> },
    { label: "TikTok Ads", value: assets.tiktokAdAccount, icon: <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.43v-7.15a8.16 8.16 0 005.58 2.18v-3.44a4.85 4.85 0 01-3-.53z"/></svg> },
  ].filter((a) => a.value);

  /* ==================== פעולות ==================== */

  function handleAddCampaign() {
    if (!newCampaign.name) return;
    setCampaigns((prev) => [
      ...prev,
      {
        id: `camp-${Date.now()}`,
        name: newCampaign.name,
        platform: newCampaign.platform,
        status: "active",
        dailyBudget: Number(newCampaign.dailyBudget) || 0,
        spent: 0,
        conversions: 0,
        costPerConversion: 0,
        roas: 0,
      },
    ]);
    setNewCampaign({ name: "", platform: "Meta", dailyBudget: "" });
    setShowCampaignModal(false);
  }

  async function handleAddTask() {
    if (!newTask.title) return;
    await addTask({
      ...newTask,
      clientId: client!.id,
    });
    setNewTask({
      title: "",
      description: "",
      assignee: "",
      priority: "medium",
      dueDate: "",
      status: "pending",
      taskType: "advertising",
      platform: "",
    });
    setShowTaskModal(false);
  }

  async function handleUpdateClient() {
    if (!client) return;
    await updateClient(client.id, {
      name: editForm.name,
      campaignManager: editForm.campaignManager,
      accountManager: editForm.accountManager,
      clientType: editForm.clientType,
      status: editForm.status,
      monthlyBudget: Number(editForm.monthlyBudget) || 0,
      currency: editForm.currency,
      contactEmail: editForm.contactEmail,
      contactPhone: editForm.contactPhone,
      notes: editForm.notes,
      digitalAssets: {
        metaAdAccount: editForm.metaAdAccount,
        googleAdAccount: editForm.googleAdAccount,
        tiktokAdAccount: editForm.tiktokAdAccount,
        facebookPage: editForm.facebookPage,
        instagram: editForm.instagram,
        linkedin: editForm.linkedin,
        website: editForm.website,
      },
      customAssets: editForm.customAssets,
      performance: {
        ...client.performance,
        targetConversions: Number(editForm.targetConversions) || 0,
        targetCostPerConversion: Number(editForm.targetCostPerConversion) || 0,
      },
    });
    setIsEditOpen(false);
  }

  function handleAddCustomAsset() {
    setEditForm((prev) => ({
      ...prev,
      customAssets: [
        ...prev.customAssets,
        { id: `custom_${Date.now()}_${Math.random()}`, label: "", value: "" },
      ],
    }));
  }

  function handleRemoveCustomAsset(id: string) {
    setEditForm((prev) => ({
      ...prev,
      customAssets: prev.customAssets.filter((a) => a.id !== id),
    }));
  }

  function handleUpdateCustomAsset(id: string, field: "label" | "value", value: string) {
    setEditForm((prev) => ({
      ...prev,
      customAssets: prev.customAssets.map((a) =>
        a.id === id ? { ...a, [field]: value } : a,
      ),
    }));
  }

  /* ==================== רינדור ==================== */

  return (
    <div className="space-y-6">
      {/* ==================== כותרת ==================== */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/clients")}
          className="rounded-lg p-2 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-brand-dark">{client.name}</h1>
          <div className="mt-1 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-bg px-2.5 py-1 text-xs font-medium">
              <span className={`h-2 w-2 rounded-full ${statusInfo.color}`} />
              {statusInfo.label}
            </span>
            <span className="text-sm text-brand-muted">{client.clientType}</span>
            {getCampaignManagerForClient(client.id, employees) && (
              <span className="text-sm text-brand-muted">קמפיינים: {getCampaignManagerForClient(client.id, employees)}</span>
            )}
            {getAccountManagerForClient(client.id, employees) && (
              <span className="text-sm text-brand-muted">תיקים: {getAccountManagerForClient(client.id, employees)}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsEditOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-brand-border px-3 py-1.5 text-sm text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
        >
          <Pencil className="h-4 w-4" />
          עריכת לקוח
        </button>
      </div>

      {/* ==================== טאבים ==================== */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-gold text-brand-dark"
                  : "text-brand-muted hover:text-brand-dark hover:bg-brand-bg"
              }`}
            >
              <Icon className="h-4 w-4" />
              {lang === "he" ? tab.heLabel : t(tab.tKey)}
            </button>
          );
        })}
      </div>

      {/* ==================== תוכן טאב ==================== */}

      {/* ===== טאב 1 — סקירה כללית ===== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* ביצועים — KPI מתקדם */}
          <MonthPerformanceKpis
            currency={client.currency}
            monthlyBudget={client.monthlyBudget}
            spent={metaPerf?.totalSpend ?? perf.budgetUsed}
            conversions={metaPerf?.totalConversions ?? perf.conversionsThisMonth}
            targetConversions={perf.targetConversions}
            costPerConversion={metaPerf?.avgCostPerConv ?? perf.avgCostPerConversion}
            targetCostPerConversion={perf.targetCostPerConversion}
            metaSpend={metaPerf?.metaSpend}
            metaConversions={metaPerf?.metaConversions}
            gadsSpend={metaPerf?.gadsSpend}
            gadsConversions={metaPerf?.gadsConversions}
          />

          {/* שורה: פרטים + נכסים דיגיטליים */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* פרטים כלליים */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-semibold text-brand-dark">פרטים כלליים</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-brand-muted" />
                  <span className="text-sm text-brand-dark">{client.contactEmail || "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-brand-muted" />
                  <span className="text-sm text-brand-dark">{client.contactPhone || "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-brand-muted" />
                  <span className="text-sm text-brand-dark">הצטרף: {formatDate(client.createdAt)}</span>
                </div>
                <div className="border-t border-brand-border pt-3">
                  <p className="mb-1 text-xs font-medium text-brand-muted">תקציב חודשי</p>
                  <p className="text-2xl font-semibold text-brand-dark">
                    {getCurrencySymbol(client.currency)} {client.monthlyBudget.toLocaleString()}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-brand-border pt-3">
                  <div>
                    <p className="text-xs font-medium text-brand-muted">יעד המרות</p>
                    <p className="mt-0.5 text-sm font-semibold text-brand-dark">{perf.targetConversions.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-brand-muted">יעד עלות להמרה</p>
                    <p className="mt-0.5 text-sm font-semibold text-brand-dark">{getCurrencySymbol(client.currency)} {perf.targetCostPerConversion}</p>
                  </div>
                </div>
                <div className="border-t border-brand-border pt-3">
                  <p className="mb-2 text-xs font-medium text-brand-muted">פלטפורמות</p>
                  <div className="flex flex-wrap gap-2">
                    {client.platforms.map((p) => (
                      <span
                        key={p}
                        className="rounded-lg border border-brand-gold/30 bg-brand-gold/10 px-3 py-1 text-sm text-brand-dark"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                {client.notes && (
                  <div className="border-t border-brand-border pt-3">
                    <p className="mb-1 text-xs font-medium text-brand-muted">הערות</p>
                    <p className="text-sm text-brand-dark">{client.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* נכסים דיגיטליים */}
            <div className={cardClass}>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-brand-dark">
                <Globe className="h-5 w-5 text-brand-muted" />
                נכסים דיגיטליים
              </h2>
              <div className="space-y-4">
                {adAccounts.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-brand-muted">חשבונות פרסום</p>
                    <div className="space-y-2">
                      {adAccounts.map((acc) => {
                        const isLink = /^https?:\/\//i.test(acc.value);
                        const content = (
                          <>
                            {acc.icon}
                            <span className="flex-1 text-sm font-medium text-brand-dark">{acc.label}</span>
                            {isLink ? (
                              <ExternalLink className="h-4 w-4 text-brand-muted" />
                            ) : (
                              <span className="font-mono text-xs text-brand-muted">{acc.value}</span>
                            )}
                          </>
                        );
                        return isLink ? (
                          <a
                            key={acc.label}
                            href={acc.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg bg-brand-bg p-3 transition-colors duration-200 hover:bg-brand-border/50"
                          >
                            {content}
                          </a>
                        ) : (
                          <div
                            key={acc.label}
                            className="flex items-center gap-3 rounded-lg bg-brand-bg p-3"
                          >
                            {content}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {assetLinks.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-brand-muted">קישורים</p>
                    <div className="space-y-2">
                      {assetLinks.map((link) => (
                        <a
                          key={link.label}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg bg-brand-bg p-3 transition-colors duration-200 hover:bg-brand-border/50"
                        >
                          {link.icon}
                          <span className="flex-1 text-sm font-medium text-brand-dark">{link.label}</span>
                          <ExternalLink className="h-4 w-4 text-brand-muted" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {client.customAssets && client.customAssets.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-brand-muted">נכסים מותאמים</p>
                    <div className="space-y-2">
                      {client.customAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center gap-3 rounded-lg bg-brand-bg p-3"
                        >
                          <span className="flex-1 text-sm font-medium text-brand-dark">{asset.label}</span>
                          <span className="text-xs text-brand-muted">{asset.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {adAccounts.length === 0 && assetLinks.length === 0 && (!client.customAssets || client.customAssets.length === 0) && (
                  <p className="text-sm text-brand-muted">לא הוגדרו נכסים דיגיטליים</p>
                )}

                {/* חיבורי פלטפורמות פרסום */}
                <div className="border-t border-brand-border pt-4">
                  <p className="mb-3 text-xs font-semibold text-brand-muted">חיבורי פלטפורמות פרסום</p>
                  <PlatformConnections clientId={client.id} />
                </div>

                {/* בחירת אירוע המרה */}
                <div className="border-t border-brand-border pt-4">
                  <ConversionEventSelector clientId={client.id} currentEvent={client.metaConversionEvent ?? ""} />
                </div>
              </div>
            </div>
          </div>

          {/* פרופיל מהיר */}
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-brand-dark">פרופיל מהיר</h2>
              <button
                onClick={() => setActiveTab("identity" as TabId)}
                className="text-xs font-medium text-brand-gold hover:text-brand-gold/70"
              >
                לתעודת זהות המלאה →
              </button>
            </div>
            <QuickProfileCard clientId={client.id} />
          </div>
        </div>
      )}

      {/* ===== טאב תעודת זהות ===== */}
      {activeTab === "identity" && (
        <ClientIdentityTab
          clientId={client.id}
          userRole={(session?.user as { role?: string })?.role ?? "campaignManager"}
          clientData={{ website: client.digitalAssets?.website ?? "", monthlyBudget: client.monthlyBudget, currency: client.currency ?? "ILS", notes: client.notes }}
        />
      )}

      {/* ===== טאב 2 — קמפיינים ===== */}
      {activeTab === "campaigns" && (
        <div className="space-y-8">
          <MetaCampaignsTab clientId={client.id} currency={client.currency ?? "ILS"} />
          <GoogleAdsCampaignsTab clientId={client.id} currency={client.currency ?? "ILS"} />
        </div>
      )}


      {/* ===== טאב 3 — ביצועים ===== */}
      {activeTab === "performance" && (
        <MetaPerformanceTab clientId={client.id} currency={client.currency ?? "ILS"} />
      )}

      {/* ===== טאב 4 — אופטימיזציות ===== */}
      {activeTab === "optimizations" && <OptimizationsTab clientId={client.id} />}

      {/* ===== טאב קריאייטיבים ===== */}
      {activeTab === "creatives" && <CreativesTab clientId={client.id} currency={client.currency ?? "ILS"} />}

      {/* ===== טאב דוחות ===== */}
      {activeTab === "reports" && (
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-brand-dark">דוחות</h2>
          {(() => {
            // ייצור דוחות דינאמיים — 6 שבועיים אחרונים + 2 חודשיים
            const now = new Date();
            const fmtRange = (start: Date, end: Date) =>
              `${start.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}-${end.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

            const reports: Array<{ id: string; type: string; period: string; sentDate: string; status: string }> = [];

            // שבוע = ראשון עד שבת.
            // מצא את השבת האחרונה שסיימה שבוע מלא (לא היום).
            // dayOfWeek: 0=ראשון, 1=שני, ..., 6=שבת
            const dayOfWeek = now.getDay();
            // ראשון(0)→1, שני(1)→2, ..., שבת(6)→7
            const lastSaturday = new Date(now);
            lastSaturday.setDate(now.getDate() - (dayOfWeek + 1));

            // 6 שבועות — כל שבוע: ראשון עד שבת
            for (let w = 0; w < 6; w++) {
              const endDate = new Date(lastSaturday);
              endDate.setDate(lastSaturday.getDate() - w * 7);
              const startDate = new Date(endDate);
              startDate.setDate(endDate.getDate() - 6); // ראשון = 6 ימים לפני שבת
              const isCurrent = w === 0;
              reports.push({
                id: `w${w}`,
                type: "שבועי",
                period: fmtRange(startDate, endDate),
                sentDate: isCurrent ? "" : endDate.toISOString().split("T")[0],
                status: isCurrent ? "pending" : "sent",
              });
            }

            // 2 חודשים — חודש שעבר + לפני שעברו
            for (let m = 1; m <= 2; m++) {
              const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
              const label = monthDate.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
              reports.push({
                id: `m${m}`,
                type: "חודשי",
                period: label,
                sentDate: new Date(now.getFullYear(), now.getMonth() - m + 1, 1).toISOString().split("T")[0],
                status: "sent",
              });
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-border bg-brand-bg/50">
                      <th className="px-4 py-3 text-right font-medium text-brand-muted">סוג</th>
                      <th className="px-4 py-3 text-right font-medium text-brand-muted">תקופת דיווח</th>
                      <th className="px-4 py-3 text-right font-medium text-brand-muted">תאריך שליחה</th>
                      <th className="px-4 py-3 text-right font-medium text-brand-muted">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id} className="border-b border-brand-border">
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.type === "חודשי" ? "bg-brand-gold/20 text-brand-dark" : "bg-blue-100 text-blue-700"}`}>
                            {r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-brand-dark">{r.period}</td>
                        <td className="px-4 py-3 text-brand-muted">{r.sentDate ? formatDate(r.sentDate) : "—"}</td>
                        <td className="px-4 py-3">
                          {r.status === "sent" ? (
                            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">נשלח</span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">לא נשלח</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ===== טאב 5 — הודעות ===== */}
      {activeTab === "messages" && <MessagesTab clientId={client.id} />}

      {/* ===== טאב 6 — אנליטיקס ===== */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-brand-dark">אנליטיקס</h2>

          <div className={cardClass}>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="mb-3 h-10 w-10 text-brand-muted/50" />
              <p className="text-sm text-brand-muted">
                יתעדכן אוטומטית לאחר חיבור Google Analytics
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "מבקרים", value: "—" },
              { label: "דפים פופולריים", value: "—" },
              { label: "מקורות תנועה", value: "—" },
              { label: "שיעור המרה", value: "—" },
            ].map((kpi) => (
              <div key={kpi.label} className={cardClass}>
                <p className="text-xs font-medium text-brand-muted">{kpi.label}</p>
                <p className="mt-2 text-2xl font-semibold text-brand-dark">{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== טאב 7 — משימות ===== */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-dark">משימות ({clientTasks.length})</h2>
            <button onClick={() => setShowTaskModal(true)} className={`inline-flex items-center gap-2 ${btnPrimary}`}>
              <Plus className="h-4 w-4" />
              הוסף משימה
            </button>
          </div>

          <div className={cardClass}>
            {clientTasks.length === 0 ? (
              <p className="text-sm text-brand-muted">אין משימות ללקוח זה</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-border text-right">
                      <th className="px-4 py-3 text-xs font-medium text-brand-muted">כותרת</th>
                      <th className="px-4 py-3 text-xs font-medium text-brand-muted">אחראי</th>
                      <th className="px-4 py-3 text-xs font-medium text-brand-muted">עדיפות</th>
                      <th className="px-4 py-3 text-xs font-medium text-brand-muted">תאריך יעד</th>
                      <th className="px-4 py-3 text-xs font-medium text-brand-muted">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientTasks.map((task) => {
                      const pri = getPriorityInfo(task.priority);
                      const ts = getTaskStatusInfo(task.status);
                      return (
                        <tr
                          key={task.id}
                          className="border-b border-brand-border/50 transition-colors duration-200 hover:bg-brand-bg/30"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-brand-dark">{task.title}</p>
                            {task.description && (
                              <p className="mt-0.5 text-xs text-brand-muted">{task.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-brand-dark">{task.assignee || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${pri.bg} ${pri.color}`}>
                              {pri.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-brand-dark">{formatDate(task.dueDate)}</td>
                          <td className="px-4 py-3 text-brand-dark">{ts.label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* מודל הוספת משימה */}
          <Modal isOpen={showTaskModal} onClose={() => setShowTaskModal(false)} title="הוסף משימה" size="lg">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">כותרת</label>
                <input
                  className={inputClass}
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  placeholder="כותרת המשימה"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">תיאור</label>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={newTask.description}
                  onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                  placeholder="תיאור המשימה"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">אחראי</label>
                  <select
                    className={inputClass}
                    value={newTask.assignee}
                    onChange={(e) => setNewTask((p) => ({ ...p, assignee: e.target.value }))}
                  >
                    <option value="">בחר אחראי</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">עדיפות</label>
                  <select
                    className={inputClass}
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask((p) => ({
                        ...p,
                        priority: e.target.value as "low" | "medium" | "high" | "urgent",
                      }))
                    }
                  >
                    <option value="low">נמוכה</option>
                    <option value="medium">בינונית</option>
                    <option value="high">גבוהה</option>
                    <option value="urgent">דחוף</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">תאריך יעד</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">סטטוס</label>
                  <select
                    className={inputClass}
                    value={newTask.status}
                    onChange={(e) =>
                      setNewTask((p) => ({
                        ...p,
                        status: e.target.value as "pending" | "in_progress" | "done",
                      }))
                    }
                  >
                    <option value="pending">בהמתנה</option>
                    <option value="in_progress">בתהליך</option>
                    <option value="done">הושלם</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">סוג משימה</label>
                  <select
                    className={inputClass}
                    value={newTask.taskType}
                    onChange={(e) =>
                      setNewTask((p) => ({
                        ...p,
                        taskType: e.target.value as "advertising" | "other",
                      }))
                    }
                  >
                    <option value="advertising">מערכות פרסום</option>
                    <option value="other">אחר</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">פלטפורמה</label>
                  <select
                    className={inputClass}
                    value={newTask.platform}
                    onChange={(e) => setNewTask((p) => ({ ...p, platform: e.target.value }))}
                  >
                    <option value="">ללא</option>
                    <option value="Meta">Meta</option>
                    <option value="Google Ads">Google Ads</option>
                    <option value="TikTok">TikTok</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-brand-muted transition-colors duration-200 hover:bg-brand-bg"
                >
                  ביטול
                </button>
                <button onClick={handleAddTask} className={btnPrimary}>
                  הוסף
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ===== טאב צ׳אט AI ===== */}
      {activeTab === "ai" && <AiChatTab clientId={client.id} clientName={client.name} />}

      {/* ==================== מודל עריכת לקוח ==================== */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="עריכת לקוח" size="lg">
        <div className="space-y-6">
          {/* פרטים כלליים */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-brand-dark">פרטים כלליים</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">שם הלקוח</label>
                <input
                  className={inputClass}
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">מנהל קמפיינים</label>
                <select
                  className={inputClass}
                  value={editForm.campaignManager}
                  onChange={(e) => setEditForm((p) => ({ ...p, campaignManager: e.target.value }))}
                >
                  <option value="">ללא</option>
                  {employees
                    .filter((emp) => emp.role === "campaignManager")
                    .map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">מנהל תיקים</label>
                <select
                  className={inputClass}
                  value={editForm.accountManager}
                  onChange={(e) => setEditForm((p) => ({ ...p, accountManager: e.target.value }))}
                >
                  <option value="">ללא</option>
                  {employees
                    .filter((emp) => emp.role === "manager")
                    .map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">סוג לקוח</label>
                <select
                  className={inputClass}
                  value={editForm.clientType}
                  onChange={(e) => setEditForm((p) => ({ ...p, clientType: e.target.value }))}
                >
                  <option value="">בחר</option>
                  {CLIENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">סטטוס</label>
                <select
                  className={inputClass}
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      status: e.target.value as "active" | "at_risk" | "upsell",
                    }))
                  }
                >
                  {CLIENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">תקציב חודשי</label>
                <input
                  type="number"
                  className={inputClass}
                  value={editForm.monthlyBudget}
                  onChange={(e) => setEditForm((p) => ({ ...p, monthlyBudget: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">מטבע</label>
                <select value={editForm.currency} onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value }))} className={inputClass}>
                  {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">אימייל</label>
                <input
                  type="email"
                  className={inputClass}
                  value={editForm.contactEmail}
                  onChange={(e) => setEditForm((p) => ({ ...p, contactEmail: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">טלפון</label>
                <input
                  className={inputClass}
                  value={editForm.contactPhone}
                  onChange={(e) => setEditForm((p) => ({ ...p, contactPhone: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">הערות</label>
              <textarea
                rows={3}
                className={inputClass}
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>

          {/* נכסים דיגיטליים */}
          <div className="space-y-4 border-t border-brand-border pt-4">
            <h3 className="text-sm font-semibold text-brand-dark">נכסים דיגיטליים</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">חשבון Meta Ads</label>
                <input
                  type="url"
                  className={inputClass}
                  placeholder="https://business.facebook.com/adsmanager/manage/accounts?act=..."
                  value={editForm.metaAdAccount}
                  onChange={(e) => setEditForm((p) => ({ ...p, metaAdAccount: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">חשבון Google Ads</label>
                <input
                  type="url"
                  className={inputClass}
                  placeholder="https://ads.google.com/aw/overview?ocid=..."
                  value={editForm.googleAdAccount}
                  onChange={(e) => setEditForm((p) => ({ ...p, googleAdAccount: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">חשבון TikTok Ads</label>
                <input
                  type="url"
                  className={inputClass}
                  placeholder="https://ads.tiktok.com/i18n/account/info?aadvid=..."
                  value={editForm.tiktokAdAccount}
                  onChange={(e) => setEditForm((p) => ({ ...p, tiktokAdAccount: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">עמוד פייסבוק</label>
                <input
                  className={inputClass}
                  placeholder="https://facebook.com/..."
                  value={editForm.facebookPage}
                  onChange={(e) => setEditForm((p) => ({ ...p, facebookPage: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">אינסטגרם</label>
                <input
                  className={inputClass}
                  placeholder="https://instagram.com/..."
                  value={editForm.instagram}
                  onChange={(e) => setEditForm((p) => ({ ...p, instagram: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">לינקדאין</label>
                <input
                  className={inputClass}
                  placeholder="https://linkedin.com/..."
                  value={editForm.linkedin}
                  onChange={(e) => setEditForm((p) => ({ ...p, linkedin: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-brand-dark">אתר</label>
                <input
                  className={inputClass}
                  placeholder="https://..."
                  value={editForm.website}
                  onChange={(e) => setEditForm((p) => ({ ...p, website: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* נכסים דיגיטליים מותאמים */}
          <div className="space-y-3 border-t border-brand-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-brand-dark">נכסים דיגיטליים מותאמים</h3>
              <button
                type="button"
                onClick={handleAddCustomAsset}
                className="rounded-lg border border-brand-border px-3 py-1.5 text-sm font-medium text-brand-muted hover:bg-brand-bg"
              >
                הוסף נכס חדש
              </button>
            </div>
            <div className="space-y-2">
              {editForm.customAssets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    placeholder="שם הנכס"
                    value={asset.label}
                    onChange={(e) => handleUpdateCustomAsset(asset.id, "label", e.target.value)}
                  />
                  <input
                    className={inputClass}
                    placeholder="ערך / קישור"
                    value={asset.value}
                    onChange={(e) => handleUpdateCustomAsset(asset.id, "value", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomAsset(asset.id)}
                    className="flex-shrink-0 rounded-lg p-2 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {editForm.customAssets.length === 0 && (
                <p className="text-sm text-brand-muted">לא הוגדרו נכסים מותאמים</p>
              )}
            </div>
          </div>

          {/* יעדים */}
          <div className="space-y-4 border-t border-brand-border pt-4">
            <h3 className="text-sm font-semibold text-brand-dark">יעדים</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">יעד המרות</label>
                <input
                  type="number"
                  className={inputClass}
                  value={editForm.targetConversions}
                  onChange={(e) => setEditForm((p) => ({ ...p, targetConversions: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">יעד עלות להמרה</label>
                <input
                  type="number"
                  className={inputClass}
                  value={editForm.targetCostPerConversion}
                  onChange={(e) => setEditForm((p) => ({ ...p, targetCostPerConversion: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* כפתורי פעולה */}
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button
              onClick={() => setIsEditOpen(false)}
              className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg"
            >
              ביטול
            </button>
            <button onClick={handleUpdateClient} className={btnPrimary}>
              שמור שינויים
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
