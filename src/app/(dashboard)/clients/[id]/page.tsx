"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
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
import { useApp } from "@/lib/data/context";
import { getCampaignManagerForClient, getAccountManagerForClient } from "@/lib/utils/resolveManagers";
import { CLIENT_STATUSES, PRIORITIES, TASK_STATUSES } from "@/lib/data/types";

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

const tabs = [
  { id: "overview", label: "סקירה כללית", icon: Target },
  { id: "campaigns", label: "קמפיינים", icon: Monitor },
  { id: "performance", label: "ביצועים", icon: TrendingUp },
  { id: "optimizations", label: "אופטימיזציות", icon: Zap },
  { id: "reports", label: "דוחות", icon: FileText },
  { id: "messages", label: "הודעות", icon: MessageSquare },
  { id: "analytics", label: "אנליטיקס", icon: BarChart3 },
  { id: "tasks", label: "משימות", icon: ListTodo },
] as const;

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
  const { getClient, tasks, addTask, addTaskNote, clients, employees, settings } = useApp();
  const client = getClient(params.id as string);

  const [activeTab, setActiveTab] = useState<TabId>("overview");

  /* קמפיינים — מצב מקומי */
  const [campaigns, setCampaigns] = useState<Campaign[]>(seedCampaigns);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", platform: "Meta", dailyBudget: "" });

  /* אופטימיזציות — מצב מקומי */
  const [localOptimizations, setLocalOptimizations] = useState<
    { id: string; date: string; description: string; platform: string; result: string }[]
  >([]);
  const [showOptModal, setShowOptModal] = useState(false);
  const [newOpt, setNewOpt] = useState({ date: "", description: "", platform: "Meta", result: "" });

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

  const convProgress =
    perf.targetConversions > 0
      ? Math.round((perf.conversionsThisMonth / perf.targetConversions) * 100)
      : 0;
  const convProgressColor =
    convProgress >= 85 ? "bg-brand-success" : convProgress >= 60 ? "bg-brand-warning" : "bg-brand-danger";

  const assetLinks = [
    { label: "עמוד פייסבוק", url: assets.facebookPage },
    { label: "אינסטגרם", url: assets.instagram },
    { label: "לינקדאין", url: assets.linkedin },
    { label: "אתר", url: assets.website },
  ].filter((a) => a.url);

  const adAccounts = [
    { label: "Meta Ads", value: assets.metaAdAccount },
    { label: "Google Ads", value: assets.googleAdAccount },
    { label: "TikTok Ads", value: assets.tiktokAdAccount },
  ].filter((a) => a.value);

  /* אופטימיזציות ממוזגות — מה-client + מקומיות */
  const allOptimizations = [
    ...client.optimizations.map((o) => ({ ...o, platform: "", result: "" })),
    ...localOptimizations,
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  /* חישוב ימים מאופטימיזציה אחרונה */
  const lastOptDate =
    allOptimizations.length > 0 ? new Date(allOptimizations[0].date) : null;
  const daysSinceOpt = lastOptDate
    ? Math.floor((Date.now() - lastOptDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

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

  function handleAddOptimization() {
    if (!newOpt.description || !newOpt.date) return;
    setLocalOptimizations((prev) => [
      ...prev,
      {
        id: `opt-${Date.now()}`,
        date: newOpt.date,
        description: newOpt.description,
        platform: newOpt.platform,
        result: newOpt.result,
      },
    ]);
    setNewOpt({ date: "", description: "", platform: "Meta", result: "" });
    setShowOptModal(false);
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
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ==================== תוכן טאב ==================== */}

      {/* ===== טאב 1 — סקירה כללית ===== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* שורה עליונה: פרטים + נכסים דיגיטליים */}
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
                    ₪ {client.monthlyBudget.toLocaleString()}
                  </p>
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
                      {adAccounts.map((acc) => (
                        <div
                          key={acc.label}
                          className="flex items-center justify-between rounded-lg bg-brand-bg p-3"
                        >
                          <span className="text-sm font-medium text-brand-dark">{acc.label}</span>
                          <span className="font-mono text-xs text-brand-muted">{acc.value}</span>
                        </div>
                      ))}
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
                          className="flex items-center justify-between rounded-lg bg-brand-bg p-3 transition-colors duration-200 hover:bg-brand-border/50"
                        >
                          <span className="text-sm font-medium text-brand-dark">{link.label}</span>
                          <ExternalLink className="h-4 w-4 text-brand-muted" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {adAccounts.length === 0 && assetLinks.length === 0 && (
                  <p className="text-sm text-brand-muted">לא הוגדרו נכסים דיגיטליים</p>
                )}
              </div>
            </div>
          </div>

          {/* ביצועים — KPI */}
          <div className={cardClass}>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-brand-dark">
              <TrendingUp className="h-5 w-5 text-brand-muted" />
              ביצועי החודש
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <div className="rounded-lg bg-brand-bg p-4">
                <p className="text-xs font-medium text-brand-muted">תקציב שנוצל</p>
                <p className="mt-1 text-xl font-semibold text-brand-dark">
                  ₪ {perf.budgetUsed.toLocaleString()}
                </p>
                <p className="text-xs text-brand-muted">מתוך ₪ {client.monthlyBudget.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-brand-bg p-4">
                <p className="text-xs font-medium text-brand-muted">עלות להמרה</p>
                <p className="mt-1 text-xl font-semibold text-brand-dark">
                  ₪ {perf.avgCostPerConversion}
                </p>
                <p className="text-xs text-brand-muted">יעד: ₪ {perf.targetCostPerConversion}</p>
              </div>
              <div className="rounded-lg bg-brand-bg p-4">
                <p className="text-xs font-medium text-brand-muted">המרות החודש</p>
                <p className="mt-1 text-xl font-semibold text-brand-dark">
                  {perf.conversionsThisMonth.toLocaleString()}
                </p>
                <p className="text-xs text-brand-muted">יעד: {perf.targetConversions.toLocaleString()}</p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-brand-border">
                  <div
                    className={`h-full rounded-full ${convProgressColor}`}
                    style={{ width: `${Math.min(convProgress, 100)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg bg-brand-bg p-4">
                <p className="text-xs font-medium text-brand-muted">אופטימיזציה אחרונה</p>
                <p className="mt-1 text-xl font-semibold text-brand-dark">
                  {formatDate(perf.lastOptimization)}
                </p>
              </div>
              <div className="rounded-lg bg-brand-bg p-4">
                <p className="text-xs font-medium text-brand-muted">משימות פתוחות</p>
                <p className="mt-1 text-xl font-semibold text-brand-dark">
                  {clientTasks.filter((t) => t.status !== "done").length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== טאב 2 — קמפיינים ===== */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-dark">קמפיינים</h2>
            <button onClick={() => setShowCampaignModal(true)} className={`inline-flex items-center gap-2 ${btnPrimary}`}>
              <Plus className="h-4 w-4" />
              הוסף קמפיין
            </button>
          </div>

          <div className={cardClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-right">
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">שם קמפיין</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">פלטפורמה</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">סטטוס</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">תקציב יומי</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">הוצאה</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">המרות</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">עלות להמרה</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-brand-border/50 transition-colors duration-200 hover:bg-brand-bg/30">
                      <td className="px-4 py-3 font-medium text-brand-dark">{c.name}</td>
                      <td className="px-4 py-3 text-brand-dark">{c.platform}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            c.status === "active"
                              ? "bg-green-50 text-brand-success"
                              : "bg-gray-100 text-brand-muted"
                          }`}
                        >
                          {c.status === "active" ? "פעיל" : "מושהה"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-brand-dark">₪ {c.dailyBudget.toLocaleString()}</td>
                      <td className="px-4 py-3 text-brand-dark">₪ {c.spent.toLocaleString()}</td>
                      <td className="px-4 py-3 text-brand-dark">{c.conversions.toLocaleString()}</td>
                      <td className="px-4 py-3 text-brand-dark">₪ {c.costPerConversion}</td>
                      <td className="px-4 py-3 font-medium text-brand-dark">{c.roas}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* מודל הוספת קמפיין */}
          <Modal isOpen={showCampaignModal} onClose={() => setShowCampaignModal(false)} title="הוסף קמפיין">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">שם קמפיין</label>
                <input
                  className={inputClass}
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign((p) => ({ ...p, name: e.target.value }))}
                  placeholder="שם הקמפיין"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">פלטפורמה</label>
                <select
                  className={inputClass}
                  value={newCampaign.platform}
                  onChange={(e) => setNewCampaign((p) => ({ ...p, platform: e.target.value }))}
                >
                  <option value="Meta">Meta</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="TikTok">TikTok</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">תקציב יומי (₪)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={newCampaign.dailyBudget}
                  onChange={(e) => setNewCampaign((p) => ({ ...p, dailyBudget: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCampaignModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-brand-muted transition-colors duration-200 hover:bg-brand-bg"
                >
                  ביטול
                </button>
                <button onClick={handleAddCampaign} className={btnPrimary}>
                  הוסף
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ===== טאב 3 — ביצועים ===== */}
      {activeTab === "performance" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-dark">ביצועים</h2>
            <span className="rounded-full bg-brand-gold/20 px-3 py-1 text-xs font-medium text-brand-dark">
              נתוני דמו
            </span>
          </div>

          {/* גרף המרות */}
          <div className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-brand-dark">המרות יומיות</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={demoChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="conversions"
                    stroke="#eed89b"
                    strokeWidth={2}
                    dot={false}
                    name="המרות"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* גרף עלות להמרה */}
          <div className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-brand-dark">עלות להמרה</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={demoChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="costPerConversion"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="עלות להמרה"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* גרף תקציב יומי */}
          <div className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-brand-dark">תקציב יומי</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={demoChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="dailySpend"
                    stroke="#eed89b"
                    strokeWidth={2}
                    dot={false}
                    name="הוצאה בפועל"
                  />
                  <Line
                    type="monotone"
                    dataKey="plannedSpend"
                    stroke="#e0e0e0"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="תקציב מתוכנן"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* מודעות מנצחות */}
          <div className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-brand-dark">מודעות מנצחות</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-right">
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">שם מודעה</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">CTR</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">המרות</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">עלות להמרה</th>
                  </tr>
                </thead>
                <tbody>
                  {winningAds.map((ad) => (
                    <tr
                      key={ad.name}
                      className="border-b border-brand-border/50 transition-colors duration-200 hover:bg-brand-bg/30"
                    >
                      <td className="px-4 py-3 font-medium text-brand-dark">{ad.name}</td>
                      <td className="px-4 py-3 text-brand-dark">{ad.ctr}</td>
                      <td className="px-4 py-3 text-brand-dark">{ad.conversions}</td>
                      <td className="px-4 py-3 text-brand-dark">₪ {ad.costPerConversion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== טאב 4 — אופטימיזציות ===== */}
      {activeTab === "optimizations" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-dark">אופטימיזציות</h2>
            <button onClick={() => setShowOptModal(true)} className={`inline-flex items-center gap-2 ${btnPrimary}`}>
              <Plus className="h-4 w-4" />
              הוסף אופטימיזציה
            </button>
          </div>

          {/* התראה אם עברו 7+ ימים */}
          {daysSinceOpt !== null && daysSinceOpt > 7 && (
            <div className="rounded-lg border border-brand-danger/30 bg-red-50 p-4">
              <p className="text-sm font-medium text-brand-danger">
                עברו {daysSinceOpt} ימים מהאופטימיזציה האחרונה!
              </p>
            </div>
          )}

          <div className={cardClass}>
            {allOptimizations.length === 0 ? (
              <p className="text-sm text-brand-muted">אין אופטימיזציות עדיין</p>
            ) : (
              <div className="space-y-4">
                {allOptimizations.map((opt) => (
                  <div key={opt.id} className="border-r-2 border-brand-gold pr-4">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-brand-muted">{formatDate(opt.date)}</p>
                      {opt.platform && (
                        <span className="rounded-full bg-brand-bg px-2 py-0.5 text-xs text-brand-muted">
                          {opt.platform}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-brand-dark">{opt.description}</p>
                    {opt.result && (
                      <p className="mt-1 text-xs text-brand-muted">תוצאה: {opt.result}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* מודל הוספת אופטימיזציה */}
          <Modal isOpen={showOptModal} onClose={() => setShowOptModal(false)} title="הוסף אופטימיזציה">
            <div className="space-y-4">
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
                <label className="mb-1 block text-sm font-medium text-brand-dark">תיאור</label>
                <input
                  className={inputClass}
                  value={newOpt.description}
                  onChange={(e) => setNewOpt((p) => ({ ...p, description: e.target.value }))}
                  placeholder="מה בוצע?"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">פלטפורמה</label>
                <select
                  className={inputClass}
                  value={newOpt.platform}
                  onChange={(e) => setNewOpt((p) => ({ ...p, platform: e.target.value }))}
                >
                  <option value="Meta">Meta</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="TikTok">TikTok</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">תוצאה</label>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={newOpt.result}
                  onChange={(e) => setNewOpt((p) => ({ ...p, result: e.target.value }))}
                  placeholder="מה היה הפידבק / תוצאה?"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowOptModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-brand-muted transition-colors duration-200 hover:bg-brand-bg"
                >
                  ביטול
                </button>
                <button onClick={handleAddOptimization} className={btnPrimary}>
                  הוסף
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* ===== טאב דוחות ===== */}
      {activeTab === "reports" && (
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-brand-dark">דוחות</h2>
          {(() => {
            const demoReports = [
              { id: "dr1", type: "שבועי", period: "01.04-07.04.2026", sentDate: "2026-04-07", status: "sent" },
              { id: "dr2", type: "שבועי", period: "25.03-31.03.2026", sentDate: "2026-03-31", status: "sent" },
              { id: "dr3", type: "חודשי", period: "מרץ 2026", sentDate: "2026-04-01", status: "sent" },
              { id: "dr4", type: "שבועי", period: "18.03-24.03.2026", sentDate: "2026-03-24", status: "sent" },
              { id: "dr5", type: "חודשי", period: "פברואר 2026", sentDate: "2026-03-01", status: "sent" },
              { id: "dr6", type: "שבועי", period: "08.04-14.04.2026", sentDate: "", status: "pending" },
            ];
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
                    {demoReports.map((r) => (
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
      {activeTab === "messages" && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-brand-dark">הודעות</h2>

          <div className={cardClass}>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="mb-3 h-10 w-10 text-brand-muted/50" />
              <p className="text-sm text-brand-muted">
                יתעדכן אוטומטית לאחר חיבור API של פייסבוק ואינסטגרם
              </p>
            </div>
          </div>

          {/* מבנה טבלה לדוגמה */}
          <div className={cardClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-right">
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">שם שולח</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">תאריך</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">תוכן</th>
                    <th className="px-4 py-3 text-xs font-medium text-brand-muted">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-brand-muted">
                      אין הודעות להצגה
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
