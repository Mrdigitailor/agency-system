"use client";

import { Bell, Search, ChevronDown } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

function formatTimeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function getAlertColor(type: string) {
  switch (type) {
    case "overdue_task": return { bg: "bg-red-50", text: "text-brand-danger" };
    case "budget_overrun": return { bg: "bg-red-50", text: "text-brand-danger" };
    case "performance_drop": return { bg: "bg-orange-50", text: "text-brand-warning" };
    case "upsell_ready": return { bg: "bg-blue-50", text: "text-brand-info" };
    case "chat_mention": return { bg: "bg-brand-gold/10", text: "text-brand-dark" };
    default: return { bg: "bg-brand-bg", text: "text-brand-dark" };
  }
}

export default function Header() {
  const router = useRouter();
  const { data: session } = useSession();
  const [showNotifications, setShowNotifications] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userName = session?.user?.name ?? "";
  const userInitial = userName.charAt(0) || "?";
  const unreadCount = alerts.filter((a) => !a.isRead).length;

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 20000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // סגירת dropdown בלחיצה בחוץ
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAlertClick = async (alert: Alert) => {
    // סמן כנקרא
    if (!alert.isRead) {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.id }),
      });
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, isRead: true } : a)));
    }
    setShowNotifications(false);
    if (alert.link) router.push(alert.link);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-brand-border bg-brand-light px-6">
      <div className="relative w-96">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
        <input
          type="text"
          placeholder="חיפוש לקוחות, משימות, דוחות..."
          className="w-full rounded-lg border border-brand-border bg-brand-bg py-2 pe-4 ps-10 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold"
          dir="rtl"
        />
      </div>

      <div className="flex items-center gap-4">
        {/* התראות */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-lg p-2 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-danger px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute left-0 top-full mt-2 w-96 rounded-lg border border-brand-border bg-brand-light shadow-lg">
              <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
                <h3 className="text-sm font-semibold text-brand-dark">התראות</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-brand-muted">{unreadCount} לא נקראו</span>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {alerts.length === 0 ? (
                  <p className="p-6 text-center text-sm text-brand-muted">אין התראות</p>
                ) : (
                  alerts.map((alert) => {
                    const colors = getAlertColor(alert.type);
                    return (
                      <button
                        key={alert.id}
                        onClick={() => handleAlertClick(alert)}
                        className={`block w-full border-b border-brand-border px-4 py-3 text-right transition-colors duration-200 hover:bg-brand-bg/50 ${!alert.isRead ? "bg-brand-gold/5" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          {!alert.isRead && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-gold" />
                          )}
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${colors.text}`}>{alert.title}</p>
                            <p className="mt-0.5 text-xs text-brand-muted line-clamp-2">{alert.message}</p>
                            <p className="mt-1 text-[10px] text-brand-muted">{formatTimeAgo(alert.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
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
