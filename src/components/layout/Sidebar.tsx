"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Target,
  FileText,
  Settings,
  Calendar,
  UserCircle,
  MessageCircle,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { navigationItems } from "@/lib/auth/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  CheckSquare,
  Target,
  FileText,
  Settings,
  Calendar,
  UserCircle,
  MessageCircle,
};

// מיפוי href → מפתח תרגום
const NAV_KEYS: Record<string, string> = {
  "/dashboard": "dashboard",
  "/clients": "clients",
  "/tasks": "tasks",
  "/calendar": "calendar",
  "/chat": "chat",
  "/crm": "crm",
  "/reports": "reports",
  "/finance": "finance",
  "/recruitment": "recruitment",
  "/suppliers": "suppliers",
  "/settings": "settings",
  "/profile": "profile",
  "/client-portal": "clientPortal",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { t, lang } = useLanguage();
  const [unreadChat, setUnreadChat] = useState(0);

  const userRole = session?.user?.role ?? "";
  const userName = session?.user?.name ?? "";

  // שליפת הודעות לא נקראו
  const fetchUnread = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/chat/unread");
      if (res.ok) {
        const data = await res.json();
        setUnreadChat(data.unread ?? 0);
      }
    } catch {}
  }, [status]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // מחכים לטעינת session לפני הצגת טאבים
  const visibleItems = status === "loading"
    ? []
    : navigationItems.filter((item) => item.roles.includes(userRole));

  return (
    <aside className={`fixed top-0 z-40 flex h-screen w-[240px] flex-col bg-brand-dark ${lang === "he" ? "right-0" : "left-0"}`}>
      {/* לוגו */}
      <div className="flex h-20 items-center justify-center px-6">
        <Image
          src="/images/logo-mrdigitailors.svg"
          alt="DigiTailors"
          width={160}
          height={40}
          priority
        />
      </div>

      {/* ניווט */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                isActive
                  ? "bg-white/10 text-brand-gold"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive ? "text-brand-gold" : "text-white/50"
                  )}
                />
              )}
              <span className="flex-1">{lang === "he" ? item.label : (t(NAV_KEYS[item.href] ?? "") || item.label)}</span>
              {item.href === "/chat" && unreadChat > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-gold text-[10px] font-bold text-brand-dark">
                  {unreadChat > 99 ? "99+" : unreadChat}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* משתמש + יציאה */}
      <div className="border-t border-white/10 p-3">
        {userName && (
          <div className="mb-2 px-3 py-1">
            <p className="text-xs text-white/50">{t("connectedAs")}</p>
            <p className="text-sm font-medium text-white/90">{userName}</p>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors duration-200 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-5 w-5 shrink-0 text-white/50" />
          <span>{t("logout")}</span>
        </button>
      </div>
    </aside>
  );
}
