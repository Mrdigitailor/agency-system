"use client";

import { Bell, Search, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useSession } from "next-auth/react";

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "";
  const userInitial = userName.charAt(0) || "?";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-brand-border bg-brand-light px-6">
      {/* חיפוש */}
      <div className="relative w-96">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
        <input
          type="text"
          placeholder="חיפוש לקוחות, משימות, דוחות..."
          className="w-full rounded-lg border border-brand-border bg-brand-bg py-2 pe-4 ps-10 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold"
          dir="rtl"
        />
      </div>

      {/* פעולות */}
      <div className="flex items-center gap-4">
        {/* התראות */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-lg p-2 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-danger text-[10px] font-semibold text-white">
              3
            </span>
          </button>

          {showNotifications && (
            <div className="absolute left-0 top-full mt-2 w-80 rounded-lg border border-brand-border bg-brand-light p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-brand-dark">
                התראות
              </h3>
              <div className="space-y-3">
                <div className="rounded-lg bg-red-50 p-3 text-sm">
                  <p className="font-medium text-brand-danger">חריגת תקציב</p>
                  <p className="text-brand-muted">לקוח &quot;אלפא מדיה&quot; — חריגה של 15%</p>
                </div>
                <div className="rounded-lg bg-orange-50 p-3 text-sm">
                  <p className="font-medium text-brand-warning">משימה תקועה</p>
                  <p className="text-brand-muted">אופטימיזציית קמפיין — 5 ימים ללא עדכון</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3 text-sm">
                  <p className="font-medium text-brand-info">מוכן לאפסייל</p>
                  <p className="text-brand-muted">לקוח &quot;בטא סולושנס&quot; — ROAS מעל 5</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* פרופיל */}
        <button className="flex items-center gap-2 rounded-lg p-2 text-brand-dark transition-colors duration-200 hover:bg-brand-bg">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold text-sm font-semibold text-brand-dark">
            {userInitial}
          </div>
          <span className="text-sm font-medium">{userName || "טוען..."}</span>
          <ChevronDown className="h-4 w-4 text-brand-muted" />
        </button>
      </div>
    </header>
  );
}
