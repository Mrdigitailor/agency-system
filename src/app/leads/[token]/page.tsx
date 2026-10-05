"use client";

// פורטל הלקוח — המוצר העצמאי: מערכת CRM מצומצמת בשחור-זהב.
// העמוד הזה הוא השלד: שער הכניסה, תפריט הצד, וטעינת רשימת הלידים שמשותפת לכמה מסכים.
// כל מסך הוא רכיב נפרד ב-components/portal. /leads/demo מציג נתוני הדגמה בלי כניסה.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, Inbox, Users, MessagesSquare, AlertTriangle, Lightbulb, BookOpen, Settings, Loader2, Mail } from "lucide-react";
import { type Tab, type Row, type DealSeed, type Customer, AUTH_LOST_EVENT, portalApi } from "@/components/portal/shared";
import LoginGate from "@/components/portal/LoginGate";
import ResultsTab from "@/components/portal/ResultsTab";
import CrmTab from "@/components/portal/CrmTab";
import ConversationsTab from "@/components/portal/ConversationsTab";
import CustomersTab from "@/components/portal/CustomersTab";
import EscalationsTab from "@/components/portal/EscalationsTab";
import InsightsTab from "@/components/portal/InsightsTab";
import KnowledgeTab from "@/components/portal/KnowledgeTab";
import SettingsTab from "@/components/portal/SettingsTab";
import MailingTab from "@/components/portal/MailingTab";
import LeadModal from "@/components/portal/LeadModal";
import CloseDealModal from "@/components/portal/CloseDealModal";

type AuthState = "loading" | "notFound" | "demo" | "needSetup" | "needPassword" | "ok";

const NAV: Array<{ key: Tab; label: string; icon: typeof Inbox; group?: string }> = [
  { key: "results", label: "דשבורד תוצאות", icon: BarChart3 },
  { key: "crm", label: "CRM · לידים", icon: Inbox },
  { key: "customers", label: "ניהול לקוחות", icon: Users },
  { key: "mailing", label: "דיוור", icon: Mail },
  { key: "conversations", label: "שיחות", icon: MessagesSquare, group: "הסוכן" },
  { key: "insights", label: "תובנות", icon: Lightbulb },
  { key: "escalations", label: "אסקלציות", icon: AlertTriangle },
  { key: "knowledge", label: "הידע של הסוכן", icon: BookOpen },
  { key: "settings", label: "הגדרות", icon: Settings, group: "המערכת" },
];
const WIDE_TABS: Tab[] = ["crm", "conversations", "mailing"];

export default function LeadsPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [auth, setAuth] = useState<AuthState>("loading");
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Tab>("crm");

  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [openEscalations, setOpenEscalations] = useState(0);

  const [openLead, setOpenLead] = useState<Row | null>(null);
  const [dealSeed, setDealSeed] = useState<DealSeed | null>(null);
  const [customersVersion, setCustomersVersion] = useState(0);
  const [demoCustomers, setDemoCustomers] = useState<Customer[]>([]);

  const demo = auth === "demo";
  const ready = auth === "ok" || demo;

  const checkAuth = useCallback(async () => {
    const res = await portalApi<{ state?: AuthState; name?: string }>(token, { path: "/auth" });
    if (res.status === 404) { setAuth("notFound"); return; }
    if (!res.ok || !res.data.state) { setAuth("notFound"); return; }
    setName(res.data.name ?? "");
    setAuth(res.data.state);
    if (res.data.state === "demo") setTab("results"); // הדמו נפתח על המסך שעושה את הרושם
  }, [token]);
  useEffect(() => { checkAuth(); }, [checkAuth]);

  // סשן שפג באמצע העבודה: חוזרים למסך הכניסה
  useEffect(() => {
    const onLost = () => setAuth((a) => (a === "ok" ? "needPassword" : a));
    window.addEventListener(AUTH_LOST_EVENT, onLost);
    return () => window.removeEventListener(AUTH_LOST_EVENT, onLost);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const res = await portalApi<{ rows?: Row[]; name?: string; openEscalations?: number }>(token, { query: `days=${days}` });
    if (res.ok) {
      setRows(res.data.rows ?? []);
      if (res.data.name) setName(res.data.name);
      setOpenEscalations(res.data.openEscalations ?? 0);
    }
    setLoading(false);
  }, [token, days]);
  useEffect(() => { if (ready) loadRows(); }, [ready, loadRows]);

  const patchRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setRelevant = (rowId: string, relevant: string) => {
    patchRow(rowId, { relevant });
    portalApi(token, { method: "PATCH", body: { kind: "relevant", id: rowId, relevant } });
  };

  if (auth === "loading") return <div className="flex min-h-screen items-center justify-center text-white/40"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (auth === "notFound") return <div className="py-24 text-center text-white/60">הקישור לא נמצא. פנו אלינו ונשלח לכם קישור חדש.</div>;
  if (auth === "needSetup" || auth === "needPassword") {
    return <LoginGate token={token} mode={auth} name={name} onDone={checkAuth} />;
  }

  return (
    <div className="flex min-h-screen">
      {/* תפריט צד — ימין */}
      <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-l border-white/10 bg-black/60 lg:flex">
        <div className="px-5 pb-4 pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-7" />
          <div className="mt-3 truncate text-sm text-white/60">{name}</div>
          {demo && <span className="mt-2 inline-block rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-0.5 text-[11px] text-brand-gold">מצב הדגמה</span>}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map(({ key, label, icon: Icon, group }) => (
            <div key={key}>
              {group && <div className="px-3 pb-1 pt-4 text-[11px] tracking-wide text-white/30">{group}</div>}
              <button onClick={() => setTab(key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200 ${tab === key ? "bg-white/10 font-medium text-brand-gold" : "text-white/60 hover:bg-white/5 hover:text-white"}`}>
                <Icon className={`h-[18px] w-[18px] ${tab === key ? "text-brand-gold" : "text-white/35"}`} />
                <span className="flex-1 text-right">{label}</span>
                {key === "escalations" && openEscalations > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-gold text-[10px] font-bold text-black">{openEscalations}</span>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-white/35">
          מכונת הלידים<br />מופעל ע״י Mr.digitailor
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ניווט מובייל */}
        <div className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-6" />
            {demo && <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-0.5 text-[10px] text-brand-gold">הדגמה</span>}
          </div>
          <div className="flex gap-1 overflow-x-auto px-2 py-2">
            {NAV.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${tab === key ? "bg-brand-gold font-medium text-black" : "text-white/60"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <main className={`mx-auto space-y-6 px-4 py-7 lg:px-8 ${WIDE_TABS.includes(tab) ? "max-w-[1600px]" : "max-w-5xl"}`}>
          {tab === "results" && <ResultsTab token={token} demo={demo} />}
          {tab === "crm" && <CrmTab rows={rows} loading={loading} days={days} setDays={setDays} demo={demo} onOpen={setOpenLead} onRelevant={setRelevant} />}
          {tab === "customers" && <CustomersTab key={customersVersion} token={token} rows={rows} onOpenLead={setOpenLead} unsaved={demoCustomers} />}
          {tab === "conversations" && <ConversationsTab rows={rows} loading={loading} days={days} setDays={setDays} demo={demo} onOpen={setOpenLead} />}
          {tab === "mailing" && <MailingTab token={token} demo={demo} />}
          {tab === "escalations" && <EscalationsTab token={token} onOpenCount={setOpenEscalations} />}
          {tab === "insights" && <InsightsTab token={token} demo={demo} />}
          {tab === "knowledge" && <KnowledgeTab token={token} />}
          {tab === "settings" && <SettingsTab token={token} demo={demo} onLogout={checkAuth} />}
        </main>
      </div>

      {openLead && (
        <LeadModal token={token} row={openLead} onClose={() => setOpenLead(null)}
          onRowChange={(patch) => { patchRow(openLead.id, patch); setOpenLead((r) => (r ? { ...r, ...patch } : r)); }}
          onCloseDeal={setDealSeed} />
      )}
      {dealSeed && (
        <CloseDealModal token={token} seed={dealSeed} onClose={() => setDealSeed(null)}
          onCreated={(customer) => {
            if (dealSeed.chatId) patchRow(dealSeed.chatId, { customerId: customer.id, status: "נסגר", manualStatus: "נסגר" });
            if (demo) setDemoCustomers((cs) => [customer, ...cs]);
            setDealSeed(null); setOpenLead(null);
            setCustomersVersion((v) => v + 1);
            setTab("customers");
          }} />
      )}
    </div>
  );
}
