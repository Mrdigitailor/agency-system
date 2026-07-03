"use client";

// הטאב המאוחד "דוחות ודשבורד" — מאחד את הדוח השבועי (נרטיב) ואת הדשבורד החי
// (קישור ציבורי מתעדכן) לממשק אחד, כי שניהם פנים של אותו דבר: מה הלקוח רואה.

import { useState } from "react";
import { FileText, LayoutDashboard } from "lucide-react";
import ClientWeeklyReportsTab from "./ClientWeeklyReportsTab";
import ClientDashboardTab from "./ClientDashboardTab";

type SubTab = "weekly" | "dashboard";

const SUB_TABS: Array<{ id: SubTab; label: string; icon: typeof FileText; hint: string }> = [
  { id: "weekly", label: "דוח שבועי", icon: FileText, hint: "נרטיב שבועי שנשלח ללקוח" },
  { id: "dashboard", label: "דשבורד חי", icon: LayoutDashboard, hint: "קישור ציבורי שמתעדכן בלייב" },
];

export default function ClientReportsHubTab({ clientId }: { clientId: string }) {
  const [sub, setSub] = useState<SubTab>("weekly");

  return (
    <div className="space-y-4">
      {/* מתג פנימי בין שני המצבים */}
      <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light p-1 w-fit">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              title={t.hint}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                active ? "bg-brand-gold text-brand-dark" : "text-brand-muted hover:text-brand-dark"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {sub === "weekly" ? <ClientWeeklyReportsTab clientId={clientId} /> : <ClientDashboardTab clientId={clientId} />}
    </div>
  );
}
