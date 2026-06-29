import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mr.digitailor Agency",
  description: "מערכת ניהול פנימית לסוכנות שיווק ופרסום דיגיטלי",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body suppressHydrationWarning className="h-full bg-brand-bg font-[family-name:var(--font-ploni)] antialiased">
        {children}
      </body>
    </html>
  );
}
