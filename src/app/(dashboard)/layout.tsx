import SidebarWrapper from "@/components/layout/SidebarWrapper";
import Header from "@/components/layout/Header";
import { AppProvider } from "@/lib/data/context";
import SessionProvider from "@/components/providers/SessionProvider";
import AiFloatingButton from "@/components/ui/AiFloatingButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AppProvider>
        <div className="min-h-screen">
          <SidebarWrapper />
          <div className="mr-[240px]">
            <Header />
            <main className="p-6">{children}</main>
          </div>
          <AiFloatingButton />
        </div>
      </AppProvider>
    </SessionProvider>
  );
}
