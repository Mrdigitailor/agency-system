"use client";

// ניהול לקוחות: מי שנסגר מהמשפך. שלב בתהליך, מבנה העסקה, תשלום ותיעוד.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Check } from "lucide-react";
import { type Customer, type Row, STAGE_CLS, cardCls, goldBtn, dealLabel, ils, fmtDate, portalApi, PageTitle } from "./shared";
import CustomerModal from "./CustomerModal";
import CloseDealModal from "./CloseDealModal";

const NONE: Customer[] = []; // מערך קבוע, שלא ייווצר חדש בכל רינדור ויגרום לטעינה חוזרת

export default function CustomersTab({ token, rows, onOpenLead, unsaved = NONE }: {
  token: string; rows: Row[]; onOpenLead: (row: Row) => void;
  unsaved?: Customer[]; // לקוחות שנוצרו בדמו: לא נשמרים בשרת, מוצגים עד רענון
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await portalApi<{ customers?: Customer[]; stages?: string[] }>(token, { query: "view=customers" });
    if (res.ok) {
      const loaded = res.data.customers ?? [];
      setCustomers([...unsaved.filter((u) => !loaded.some((c) => c.id === u.id)), ...loaded]);
      setStages(res.data.stages ?? []);
    }
    setLoading(false);
  }, [token, unsaved]);
  useEffect(() => { load(); }, [load]);

  const patchLocal = (c: Customer) => setCustomers((cs) => cs.map((x) => (x.id === c.id ? c : x)));
  const save = (id: string, patch: Partial<Customer>) => { portalApi(token, { method: "PATCH", body: { kind: "customer", id, ...patch } }); };

  const open = customers.find((c) => c.id === openId) ?? null;
  const sourceRow = open?.sourceChatId ? rows.find((r) => r.id === open.sourceChatId) : undefined;

  const dealSummary = (c: Customer) => c.dealType === "percent"
    ? `${c.percentRate}% מהעסקאות`
    : [c.amountPaid ? `${c.dealType === "setup_retainer" ? "הקמה" : "עסקה"} ${ils(c.amountPaid)}` : "", c.monthlyFee ? `ריטיינר ${ils(c.monthlyFee)} לחודש` : ""].filter(Boolean).join(" · ") || "-";

  return (
    <>
      <PageTitle title="ניהול לקוחות" sub="מי שנסגר מהמשפך: באיזה שלב הוא, איך העסקה בנויה, ומה שולם">
        <button onClick={() => setAdding(true)} className={goldBtn}><Plus className="h-4 w-4" /> לקוח חדש</button>
      </PageTitle>

      <div className={`${cardCls} overflow-x-auto`}>
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-white/40">
              <th className="px-4 py-3 font-medium">לקוח</th>
              <th className="px-4 py-3 font-medium">קשר</th>
              <th className="px-4 py-3 font-medium">שלב בתהליך</th>
              <th className="px-4 py-3 font-medium">מבנה העסקה</th>
              <th className="px-4 py-3 font-medium">תשלום</th>
              <th className="px-4 py-3 font-medium">נסגר</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-12 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && customers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-white/40">
                עדיין אין לקוחות. כשעסקה נסגרת, פותחים את הליד ב-CRM ולוחצים &quot;סגירת עסקה&quot;.
              </td></tr>
            )}
            {!loading && customers.map((c) => (
              <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.05]">
                <td className="px-4 py-3.5">
                  <div className="font-medium text-white">{c.name}</div>
                  <div className="text-xs text-white/40">{c.business}</div>
                </td>
                <td className="px-4 py-3.5 text-xs text-white/50">
                  <div>{c.email}</div><div dir="ltr" className="text-right">{c.phone}</div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${STAGE_CLS[c.stage] ?? "bg-white/10 text-white/70"}`}>{c.stage}</span>
                </td>
                <td className="px-4 py-3.5 text-xs text-white/60">
                  <div>{dealLabel(c.dealType)}</div>
                  <div className="mt-0.5 text-white/40">{dealSummary(c)}</div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${c.paid ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
                    {c.paid ? <><Check className="h-3.5 w-3.5" /> שילם</> : "לא שילם"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs text-white/40">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <CustomerModal customer={open} stages={stages} onChange={patchLocal} onSave={(patch) => save(open.id, patch)}
          onClose={() => setOpenId(null)}
          onOpenSourceChat={sourceRow ? () => { setOpenId(null); onOpenLead(sourceRow); } : undefined} />
      )}
      {adding && (
        <CloseDealModal token={token} seed={{ name: "", business: "", phone: "", email: "" }} onClose={() => setAdding(false)}
          onCreated={(c) => { setCustomers((cs) => [c, ...cs]); setAdding(false); }} />
      )}
    </>
  );
}
