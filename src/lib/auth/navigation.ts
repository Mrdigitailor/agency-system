import type { NavItem } from "@/types";

export const navigationItems: NavItem[] = [
  // === ממשק עובדים ===
  {
    label: "דשבורד",
    href: "/dashboard",
    icon: "LayoutDashboard",
    roles: ["admin", "manager", "campaignManager"],
  },
  {
    label: "לקוחות",
    href: "/clients",
    icon: "Users",
    roles: ["admin", "manager"],
  },
  {
    label: "הלקוחות שלי",
    href: "/clients",
    icon: "Users",
    roles: ["campaignManager"],
  },
  {
    label: "משימות",
    href: "/tasks",
    icon: "CheckSquare",
    roles: ["admin", "manager", "campaignManager"],
  },
  {
    label: "יומן",
    href: "/calendar",
    icon: "Calendar",
    roles: ["admin", "manager", "campaignManager"],
  },
  {
    label: "צ׳אט",
    href: "/chat",
    icon: "MessageCircle",
    roles: ["admin", "manager", "campaignManager"],
  },
  {
    label: "CRM",
    href: "/crm",
    icon: "Target",
    roles: ["admin"],
  },
  {
    label: "דוחות",
    href: "/reports",
    icon: "FileText",
    roles: ["admin", "manager", "campaignManager"],
  },
  {
    label: "כספים",
    href: "/finance",
    icon: "FileText",
    roles: ["admin"],
  },
  {
    label: "גיוסים",
    href: "/recruitment",
    icon: "Users",
    roles: ["admin"],
  },
  {
    label: "ספקים",
    href: "/suppliers",
    icon: "Users",
    roles: ["admin", "manager"],
  },
  {
    label: "הגדרות",
    href: "/settings",
    icon: "Settings",
    roles: ["admin"],
  },
  {
    label: "פרופיל",
    href: "/profile",
    icon: "UserCircle",
    roles: ["manager", "campaignManager"],
  },

  // === ממשק לקוח קצה ===
  {
    label: "דשבורד",
    href: "/client-portal",
    icon: "LayoutDashboard",
    roles: ["client"],
  },
  {
    label: "משימות",
    href: "/client-portal/tasks",
    icon: "CheckSquare",
    roles: ["client"],
  },
  {
    label: "דוחות",
    href: "/client-portal/reports",
    icon: "FileText",
    roles: ["client"],
  },
  {
    label: "פרופיל",
    href: "/client-portal/profile",
    icon: "UserCircle",
    roles: ["client"],
  },
];

export function getDefaultRoute(role: string): string {
  switch (role) {
    case "client": return "/client-portal";
    default: return "/dashboard";
  }
}
