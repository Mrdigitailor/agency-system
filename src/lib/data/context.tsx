"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Client, Task, Lead, Employee, Settings, TaskNote, LeadCall, Alert } from "./types";

// ==================== API Helpers ====================

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

// ==================== Context ====================

interface AppContextType {
  clients: Client[];
  addClient: (data: Omit<Client, "id" | "createdAt" | "optimizations">) => Promise<void>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  getClient: (id: string) => Client | undefined;
  refreshClients: () => Promise<void>;

  tasks: Task[];
  addTask: (data: Omit<Task, "id" | "createdAt" | "notes">) => Promise<void>;
  addTaskNote: (taskId: string, note: { author: string; content: string }) => Promise<void>;
  refreshTasks: () => Promise<void>;

  leads: Lead[];
  addLead: (data: Omit<Lead, "id" | "createdAt" | "calls">) => Promise<void>;
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>;
  addLeadCall: (leadId: string, call: Omit<LeadCall, "id">) => Promise<void>;
  refreshLeads: () => Promise<void>;

  employees: Employee[];
  addEmployee: (data: Omit<Employee, "id">) => Promise<void>;
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  refreshEmployees: () => Promise<void>;

  alerts: Alert[];
  markAlertRead: (id: string) => void;

  settings: Settings;
  updateSettings: (data: Partial<Settings>) => void;

  isLoading: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

// מיפוי מ-DB לטיפוסים
function mapClient(c: Record<string, unknown>): Client {
  return {
    id: c.id as string,
    name: c.name as string,
    manager: c.manager as string,
    campaignManager: (c.campaignManager as string) ?? "",
    accountManager: (c.accountManager as string) ?? "",
    platforms: (c.platforms as string[]) ?? [],
    monthlyBudget: c.monthlyBudget as number,
    clientType: c.clientType as string,
    status: c.status as Client["status"],
    contactEmail: c.contactEmail as string,
    contactPhone: c.contactPhone as string,
    notes: c.notes as string,
    createdAt: (c.createdAt as string) ?? "",
    digitalAssets: {
      metaAdAccount: c.metaAdAccount as string,
      googleAdAccount: c.googleAdAccount as string,
      tiktokAdAccount: c.tiktokAdAccount as string,
      facebookPage: c.facebookPage as string,
      instagram: c.instagram as string,
      linkedin: c.linkedin as string,
      website: c.website as string,
    },
    customAssets: (c.customAssets as unknown as { id: string; label: string; value: string }[]) ?? [],
    performance: {
      budgetUsed: c.budgetUsed as number,
      avgCostPerConversion: c.avgCostPerConversion as number,
      targetCostPerConversion: c.targetCostPerConversion as number,
      conversionsThisMonth: c.conversionsThisMonth as number,
      targetConversions: c.targetConversions as number,
      lastOptimization: c.lastOptimization as string,
    },
    optimizations: ((c.optimizations as Record<string, unknown>[]) ?? []).map((o) => ({
      id: o.id as string,
      date: o.date as string,
      description: o.description as string,
    })),
  };
}

function mapTask(t: Record<string, unknown>): Task {
  return {
    id: t.id as string,
    title: t.title as string,
    description: t.description as string,
    clientId: t.clientId as string,
    assignee: t.assignee as string,
    priority: t.priority as Task["priority"],
    dueDate: t.dueDate as string,
    status: t.status as Task["status"],
    taskType: t.taskType as Task["taskType"],
    platform: t.platform as string,
    createdAt: (t.createdAt as string) ?? "",
    notes: ((t.notes as Record<string, unknown>[]) ?? []).map((n) => ({
      id: n.id as string,
      author: n.authorName as string,
      content: n.content as string,
      createdAt: (n.createdAt as string) ?? "",
    })),
  };
}

function mapLead(l: Record<string, unknown>): Lead {
  return {
    id: l.id as string,
    name: l.name as string,
    email: l.email as string,
    phone: l.phone as string,
    company: l.company as string,
    website: l.website as string,
    digitalAssets: l.digitalAssets as string,
    leadFacebookPage: (l.leadFacebookPage as string) ?? "",
    leadInstagram: (l.leadInstagram as string) ?? "",
    leadLinkedin: (l.leadLinkedin as string) ?? "",
    leadTiktok: (l.leadTiktok as string) ?? "",
    leadGoogleAds: (l.leadGoogleAds as string) ?? "",
    leadMetaAds: (l.leadMetaAds as string) ?? "",
    estimatedBudget: l.estimatedBudget as string,
    salesPerson: l.salesPerson as string,
    interestedServices: (l.interestedServices as string[]) ?? [],
    source: l.source as Lead["source"],
    status: l.status as Lead["status"],
    value: l.value as number,
    notes: l.notes as string,
    nextFollowUp: l.nextFollowUp as string,
    hasProposal: l.hasProposal as boolean,
    proposalDate: l.proposalDate as string,
    proposalFileName: l.proposalFileName as string,
    internalNotes: l.internalNotes as string,
    createdAt: (l.createdAt as string) ?? "",
    calls: ((l.calls as Record<string, unknown>[]) ?? []).map((c) => ({
      id: c.id as string,
      date: c.date as string,
      summary: c.summary as string,
      caller: c.callerName as string,
    })),
  };
}

function mapEmployee(e: Record<string, unknown>): Employee {
  return {
    id: e.id as string,
    name: e.name as string,
    email: e.email as string,
    phone: e.phone as string,
    role: e.role as string,
    assignedClientIds: (e.assignedClientIds as string[]) ?? [],
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    agencyName: "DigiTailors",
    userName: "סער",
    userEmail: "saar@digitailors.co.il",
    userRole: "admin",
    agencyAssets: { googleMyBusiness: "", facebookPage: "", instagram: "", linkedin: "", metaAdAccount: "", googleAdAccount: "", tiktokAdAccount: "", googleAnalytics: "" },
  });

  // טעינה ראשונית
  useEffect(() => {
    Promise.all([
      api<Record<string, unknown>[]>("/api/clients").then((data) => setClients(data.map(mapClient))),
      api<Record<string, unknown>[]>("/api/tasks").then((data) => setTasks(data.map(mapTask))),
      api<Record<string, unknown>[]>("/api/leads").then((data) => setLeads(data.map(mapLead))),
      api<Record<string, unknown>[]>("/api/employees").then((data) => setEmployees(data.map(mapEmployee))),
      api<Record<string, unknown>[]>("/api/alerts").then((data) => setAlerts(data as unknown as Alert[])),
      api<Record<string, unknown>>("/api/settings").then((data) => {
        setSettings((prev) => ({
          ...prev,
          agencyName: (data.agencyName as string) ?? prev.agencyName,
          agencyAssets: {
            googleMyBusiness: (data.googleMyBusiness as string) ?? "",
            facebookPage: (data.facebookPage as string) ?? "",
            instagram: (data.instagram as string) ?? "",
            linkedin: (data.linkedin as string) ?? "",
            metaAdAccount: (data.metaAdAccount as string) ?? "",
            googleAdAccount: (data.googleAdAccount as string) ?? "",
            tiktokAdAccount: (data.tiktokAdAccount as string) ?? "",
            googleAnalytics: (data.googleAnalytics as string) ?? "",
          },
        }));
      }),
    ]).finally(() => setIsLoading(false));
  }, []);

  // התראות אוטומטיות על משימות באיחור
  useEffect(() => {
    const now = new Date();
    const overdueTasks = tasks.filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < now);
    const existingTaskIds = new Set(alerts.filter((a) => a.type === "overdue_task").map((a) => a.message));
    const newAlerts: Alert[] = [];
    for (const t of overdueTasks) {
      if (!existingTaskIds.has(t.id)) {
        const clientName = clients.find((c) => c.id === t.clientId)?.name ?? "";
        newAlerts.push({
          id: `alert_${t.id}`,
          type: "overdue_task",
          title: `משימה באיחור: ${t.title}${clientName ? ` (${clientName})` : ""}`,
          message: t.id,
          isRead: false,
          createdAt: now.toISOString().split("T")[0],
        });
      }
    }
    if (newAlerts.length > 0) setAlerts((prev) => [...newAlerts, ...prev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // ==================== Clients ====================
  const refreshClients = useCallback(async () => {
    const data = await api<Record<string, unknown>[]>("/api/clients");
    setClients(data.map(mapClient));
  }, []);

  const addClient = useCallback(async (data: Omit<Client, "id" | "createdAt" | "optimizations">) => {
    const flat = {
      name: data.name, manager: data.manager,
      campaignManager: data.campaignManager, accountManager: data.accountManager,
      platforms: data.platforms,
      monthlyBudget: data.monthlyBudget, clientType: data.clientType, status: data.status,
      contactEmail: data.contactEmail, contactPhone: data.contactPhone, notes: data.notes,
      ...data.digitalAssets, ...data.performance,
    };
    await api("/api/clients", { method: "POST", body: JSON.stringify(flat) });
    await refreshClients();
  }, [refreshClients]);

  const updateClient = useCallback(async (id: string, data: Partial<Client>) => {
    // שטח את digitalAssets אם קיים
    const flat: Record<string, unknown> = { ...data };
    if (data.digitalAssets) {
      Object.assign(flat, data.digitalAssets);
      delete flat.digitalAssets;
    }
    if (data.performance) {
      Object.assign(flat, data.performance);
      delete flat.performance;
    }
    delete flat.optimizations;
    delete flat.createdAt;
    delete flat.id;
    await api(`/api/clients/${id}`, { method: "PATCH", body: JSON.stringify(flat) });
    await refreshClients();
  }, [refreshClients]);

  const getClient = useCallback((id: string) => clients.find((c) => c.id === id), [clients]);

  // ==================== Tasks ====================
  const refreshTasks = useCallback(async () => {
    const data = await api<Record<string, unknown>[]>("/api/tasks");
    setTasks(data.map(mapTask));
  }, []);

  const addTask = useCallback(async (data: Omit<Task, "id" | "createdAt" | "notes">) => {
    await api("/api/tasks", { method: "POST", body: JSON.stringify(data) });
    await refreshTasks();
  }, [refreshTasks]);

  const addTaskNote = useCallback(async (taskId: string, note: { author: string; content: string }) => {
    await api(`/api/tasks/${taskId}/notes`, { method: "POST", body: JSON.stringify(note) });
    await refreshTasks();
  }, [refreshTasks]);

  // ==================== Leads ====================
  const refreshLeads = useCallback(async () => {
    const data = await api<Record<string, unknown>[]>("/api/leads");
    setLeads(data.map(mapLead));
  }, []);

  const addLead = useCallback(async (data: Omit<Lead, "id" | "createdAt" | "calls">) => {
    await api("/api/leads", { method: "POST", body: JSON.stringify(data) });
    await refreshLeads();
  }, [refreshLeads]);

  const updateLead = useCallback(async (id: string, data: Partial<Lead>) => {
    await api(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    await refreshLeads();
  }, [refreshLeads]);

  const addLeadCall = useCallback(async (leadId: string, call: Omit<LeadCall, "id">) => {
    await api(`/api/leads/${leadId}/calls`, { method: "POST", body: JSON.stringify(call) });
    await refreshLeads();
  }, [refreshLeads]);

  // ==================== Employees ====================
  const refreshEmployees = useCallback(async () => {
    const data = await api<Record<string, unknown>[]>("/api/employees");
    setEmployees(data.map(mapEmployee));
  }, []);

  const addEmployee = useCallback(async (data: Omit<Employee, "id">) => {
    await api("/api/employees", { method: "POST", body: JSON.stringify(data) });
    await refreshEmployees();
  }, [refreshEmployees]);

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    await api(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    await refreshEmployees();
  }, [refreshEmployees]);

  const deleteEmployee = useCallback(async (id: string) => {
    await api(`/api/employees/${id}`, { method: "DELETE" });
    await refreshEmployees();
  }, [refreshEmployees]);

  // ==================== Alerts ====================
  const markAlertRead = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, isRead: true } : a));
    api("/api/alerts", { method: "PATCH", body: JSON.stringify({ id }) });
  }, []);

  // ==================== Settings ====================
  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    // שמור הגדרות סוכנות ל-DB
    if (partial.agencyName || partial.agencyAssets) {
      const dbData: Record<string, unknown> = {};
      if (partial.agencyName) dbData.agencyName = partial.agencyName;
      if (partial.agencyAssets) Object.assign(dbData, partial.agencyAssets);
      api("/api/settings", { method: "PATCH", body: JSON.stringify(dbData) });
    }
  }, []);

  return (
    <AppContext.Provider value={{
      clients, addClient, updateClient, getClient, refreshClients,
      tasks, addTask, addTaskNote, refreshTasks,
      leads, addLead, updateLead, addLeadCall, refreshLeads,
      employees, addEmployee, updateEmployee, deleteEmployee, refreshEmployees,
      alerts, markAlertRead,
      settings, updateSettings,
      isLoading,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
