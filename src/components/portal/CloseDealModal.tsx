"use client";

// סגירת עסקה: נפתח כשמסמנים ליד כ"נסגר" (או כשמוסיפים לקוח ידנית).
// שואל איך העסקה בנויה ובכמה, יוצר את הלקוח, ומסמן את הליד כסגור.
import { useState } from "react";
import { Loader2, X, Check } from "lucide-react";
import { type Customer, type DealSeed, DEAL_TYPES, portalApi, inputCls, goldBtn } from "./shared";

export default function CloseDealModal({ token, seed, onClose, onCreated }: {
  token: string; seed: DealSeed; onClose: () => void; onCreated: (customer: Customer) => void;
}) {
  const [f, setF] = useState({ name: seed.name, business: seed.business, phone: seed.phone, email: seed.email });
  const [dealType, setDealType] = useState("one_time");
  const [amountPaid, setAmountPaid] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [percentRate, setPercentRate] = useState("");
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fromLead = Boolean(seed.chatId);

  const submit = async () => {
    setError("");
    if (!f.name.trim()) { setError("חסר שם"); return; }
    setBusy(true);
    const res = await portalApi<{ customer?: Customer; error?: string }>(token, {
      method: "POST",
      body: {
        kind: "customer", ...f, sourceChatId: seed.chatId, dealType, paid,
        amountPaid: Number(amountPaid) || 0, monthlyFee: Number(monthlyFee) || 0, percentRate: Number(percentRate) || 0,
      },
    });
    setBusy(false);
    if (res.ok && res.data.customer) { onCreated(res.data.customer); return; }
    setError(res.data.error ?? "השמירה נכשלה, נסו שוב");
  };

  const field = (key: keyof typeof f, label: string) => (
    <div>
      <label className="mb-1 block text-xs text-white/50">{label}</label>
      <input value={f[key]} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} className={`${inputCls} w-full`} />
    </div>
  );
  const amount = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <label className="mb-1 block text-xs text-white/50">{label}</label>
      <input type="number" min={0} value={value} onChange={(e) => set(e.target.value)} className={`${inputCls} w-full`} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3" onClick={onClose}>
      <div dir="rtl" className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-[#0d0c0a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/10 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{fromLead ? "סגירת עסקה" : "לקוח חדש"}</h2>
            <p className="text-sm text-white/50">{fromLead ? "הליד יסומן כסגור ויעבור לניהול לקוחות" : "הוספת לקוח שלא הגיע דרך הצ'אט"}</p>
          </div>
          <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            {field("name", "שם *")}{field("business", "עסק")}{field("phone", "טלפון")}{field("email", "מייל")}
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/50">איך העסקה בנויה?</label>
            <select value={dealType} onChange={(e) => setDealType(e.target.value)} className={`${inputCls} w-full`}>
              {DEAL_TYPES.map((d) => <option key={d.value} value={d.value} className="bg-black">{d.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {dealType === "one_time" && amount("שווי העסקה (חד פעמי) ₪", amountPaid, setAmountPaid)}
            {dealType === "setup_retainer" && amount("הקמה חד פעמית ₪", amountPaid, setAmountPaid)}
            {(dealType === "retainer" || dealType === "setup_retainer") && amount("ריטיינר חודשי ₪", monthlyFee, setMonthlyFee)}
            {dealType === "percent" && amount("אחוז מהעסקאות %", percentRate, setPercentRate)}
          </div>

          <button type="button" onClick={() => setPaid((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${paid ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>
            {paid ? <><Check className="h-4 w-4" /> כבר שולם</> : "עוד לא שולם"}
          </button>

          {error && <div className="text-sm text-red-300">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white">ביטול</button>
            <button onClick={submit} disabled={busy || !f.name.trim()} className={goldBtn}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : fromLead ? "סגירת העסקה" : "שמירה"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
