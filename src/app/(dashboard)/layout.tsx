import SidebarWrapper from "@/components/layout/SidebarWrapper";
import Header from "@/components/layout/Header";
import { AppProvider } from "@/lib/data/context";
import SessionProvider from "@/components/providers/SessionProvider";
import AiFloatingButton from "@/components/ui/AiFloatingButton";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import DashboardShell, { ContentArea } from "@/components/layout/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <LanguageProvider>
        <AppProvider>
          <DashboardShell>
            <SidebarWrapper />
            <ContentArea>
              <Header />
              <main className="p-6">{children}</main>
            </ContentArea>
            <AiFloatingButton />
          </DashboardShell>
        </AppProvider>
      </LanguageProvider>
    </SessionProvider>
  );
}
