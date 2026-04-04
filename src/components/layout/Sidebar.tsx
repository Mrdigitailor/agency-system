"use client";

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
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { navigationItems } from "@/lib/auth/navigation";

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  CheckSquare,
  Target,
  FileText,
  Settings,
  Calendar,
  UserCircle,
};

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const userRole = session?.user?.role ?? "";
  const userName = session?.user?.name ?? "";

  // מחכים לטעינת session לפני הצגת טאבים
  const visibleItems = status === "loading"
    ? []
    : navigationItems.filter((item) => item.roles.includes(userRole));

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-screen w-[240px] flex-col bg-brand-dark">
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
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* משתמש + יציאה */}
      <div className="border-t border-white/10 p-3">
        {userName && (
          <div className="mb-2 px-3 py-1">
            <p className="text-xs text-white/50">מחובר כ:</p>
            <p className="text-sm font-medium text-white/90">{userName}</p>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors duration-200 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-5 w-5 shrink-0 text-white/50" />
          <span>יציאה</span>
        </button>
      </div>
    </aside>
  );
}
