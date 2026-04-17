"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  return (
    <div className="min-h-screen" dir={dir}>
      {children}
    </div>
  );
}

export function ContentArea({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  return (
    <div className={dir === "rtl" ? "mr-[240px]" : "ml-[240px]"}>
      {children}
    </div>
  );
}
