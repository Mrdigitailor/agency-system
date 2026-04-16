// ==================== לקוחות ====================

export interface ClientDigitalAssets {
  metaAdAccount: string;
  googleAdAccount: string;
  tiktokAdAccount: string;
  facebookPage: string;
  instagram: string;
  linkedin: string;
  website: string;
}

export interface CustomAsset {
  id: string;
  label: string;
  value: string;
}

export interface ClientPerformance {
  budgetUsed: number;
  avgCostPerConversion: number;
  targetCostPerConversion: number;
  conversionsThisMonth: number;
  targetConversions: number;
  lastOptimization: string;
}

export interface Optimization {
  id: string;
  date: string;
  description: string;
}

export interface Client {
  id: string;
  name: string;
  manager: string;
  campaignManager: string;
  accountManager: string;
  platforms: string[];
  monthlyBudget: number;
  currency: string;
  metaConversionEvent: string;
  clientType: string;
  status: "active" | "at_risk" | "upsell";
  contactEmail: string;
  contactPhone: string;
  notes: string;
  createdAt: string;
  digitalAssets: ClientDigitalAssets;
  customAssets: CustomAsset[];
  performance: ClientPerformance;
  optimizations: Optimization[];
  currentMonthSpend?: number;
  currentMonthConversions?: number;
  currentMonthCostPerConv?: number;
  hasMetaData?: boolean;
}

// ==================== משימות ====================

export interface TaskNote {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  clientId: string;
  assignee: string;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string;
  status: "pending" | "in_progress" | "done";
  taskType: "advertising" | "other";
  platform: string;
  createdAt: string;
  notes: TaskNote[];
}

// ==================== התראות ====================

export interface Alert {
  id: string;
  type: "overdue_task" | "budget_overrun" | "performance_drop" | "upsell_ready";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// ==================== לידים ====================

export interface LeadCall {
  id: string;
  date: string;
  summary: string;
  caller: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  digitalAssets: string;
  leadFacebookPage: string;
  leadInstagram: string;
  leadLinkedin: string;
  leadTiktok: string;
  leadGoogleAds: string;
  leadMetaAds: string;
  estimatedBudget: string;
  salesPerson: string;
  interestedServices: string[];
  source: "website" | "referral" | "social" | "cold_call" | "event" | "other";
  status: "new" | "contacted" | "meeting_set" | "proposal_sent" | "negotiation" | "won" | "lost" | "churned";
  value: number;
  notes: string;
  nextFollowUp: string;
  hasProposal: boolean;
  proposalDate: string;
  proposalFileName: string;
  internalNotes: string;
  qualityRating: number;
  dealValue: number;
  monthlyValue: number;
  serviceType: string;
  proposalUrl: string;
  closedAt: string;
  endDate: string;
  churnedAt: string;
  churnReason: string;
  churnDetails: string;
  createdAt: string;
  calls: LeadCall[];
}

// ==================== עובדים ====================

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  assignedClientIds: string[];
}

// ==================== הגדרות ====================

export interface AgencyDigitalAssets {
  googleMyBusiness: string;
  facebookPage: string;
  instagram: string;
  linkedin: string;
  metaAdAccount: string;
  googleAdAccount: string;
  tiktokAdAccount: string;
  googleAnalytics: string;
}

export interface Settings {
  agencyName: string;
  userName: string;
  userEmail: string;
  userRole: string;
  agencyAssets: AgencyDigitalAssets;
}

// ==================== קבועים ====================

export const PLATFORMS = ["Meta", "Google Ads", "TikTok"] as const;
export const CLIENT_TYPES = ["לידים", "ecom", "שירותי"] as const;

export const CLIENT_STATUSES = [
  { value: "active" as const, label: "תקין", color: "bg-brand-success" },
  { value: "at_risk" as const, label: "בסיכון", color: "bg-brand-warning" },
  { value: "upsell" as const, label: "מוכן לאפסייל", color: "bg-brand-info" },
];

export const PRIORITIES = [
  { value: "low" as const, label: "נמוכה", color: "text-brand-muted", bg: "bg-gray-100" },
  { value: "medium" as const, label: "בינונית", color: "text-brand-info", bg: "bg-blue-50" },
  { value: "high" as const, label: "גבוהה", color: "text-brand-warning", bg: "bg-orange-50" },
  { value: "urgent" as const, label: "דחוף", color: "text-brand-danger", bg: "bg-red-50" },
];

export const TASK_STATUSES = [
  { value: "pending" as const, label: "בהמתנה" },
  { value: "in_progress" as const, label: "בתהליך" },
  { value: "done" as const, label: "הושלם" },
];

export const TASK_TYPES = [
  { value: "advertising" as const, label: "מערכות פרסום" },
  { value: "other" as const, label: "אחר" },
];

export const LEAD_SOURCES = [
  { value: "website" as const, label: "אתר" },
  { value: "referral" as const, label: "הפניה" },
  { value: "social" as const, label: "רשתות חברתיות" },
  { value: "cold_call" as const, label: "שיחה קרה" },
  { value: "event" as const, label: "אירוע" },
  { value: "other" as const, label: "אחר" },
];

export const LEAD_STATUSES = [
  { value: "new" as const, label: "חדש", color: "bg-brand-info" },
  { value: "contacted" as const, label: "נוצר קשר", color: "bg-purple-500" },
  { value: "meeting_set" as const, label: "נקבעה פגישה", color: "bg-brand-warning" },
  { value: "proposal_sent" as const, label: "נשלחה הצעה", color: "bg-orange-500" },
  { value: "negotiation" as const, label: "משא ומתן", color: "bg-brand-gold" },
  { value: "won" as const, label: "נסגר", color: "bg-brand-success" },
  { value: "lost" as const, label: "אבד", color: "bg-brand-danger" },
  { value: "churned" as const, label: "נוטש", color: "bg-gray-500" },
];

// Monday stages — for CRM Kanban columns
export const LEAD_STAGES = [
  { value: "לידים נכנסים", label: "לידים נכנסים", color: "bg-brand-info" },
  { value: "פולואפ", label: "פולואפ", color: "bg-purple-500" },
  { value: "נשלחה הצעת מחיר", label: "נשלחה הצעת מחיר", color: "bg-brand-warning" },
  { value: "נסגרו", label: "נסגרו", color: "bg-brand-success" },
  { value: "לא רלוונטיים", label: "לא רלוונטיים", color: "bg-brand-muted" },
  { value: "סיימו פעילות", label: "סיימו פעילות", color: "bg-brand-danger" },
  { value: "טווח רחוק", label: "טווח רחוק", color: "bg-gray-400" },
] as const;

export const INTERESTED_SERVICES = [
  "ניהול קמפיינים",
  "SEO",
  "ברנדינג",
  "סושיאל",
  "אתרים",
] as const;

// MANAGERS הוסר — משתמשים ב-employees מה-context
