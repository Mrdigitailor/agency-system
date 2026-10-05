"use client";

// כרטיס לקוח מלא: פרטים, מבנה העסקה, תשלום ותיעוד. כל שדה נשמר כשיוצאים ממנו.
import { X, Check, MessagesSquare } from "lucide-react";
import { type Customer, DEAL_TYPES, cardCls, inputCls, fmtFull } from "./shared";

export default function CustomerModal({ customer, stages, onChange, onSave, onClose, onOpenSourceChat }: {
  customer: Customer; stages: string[];
  onChange: (c: Customer) => void;                 // עדכון מקומי תוך כדי הקלדה
  onSave: (patch: Partial<Customer>) => void;      // שמירה לשרת
  onClose: () => void; onOpenSourceChat?: () => void;
}) {
  const c = customer;
  const text = (field: "name" | "business" | "phone" | "email", label: string) => (
    <div key={field}>
      <label className="mb-1 block text-xs text-white/50">{label}</label>
      <input value={c[field] ?? ""} onChange={(e) => onChange({ ...c, [field]: e.target.value })}
        onBlur={(e) => onSave({ [field]: e.target.value })} className={`${inputCls} w-full`} />
    </div>
  );
  const amount = (field: "amountPaid" | "monthlyFee" | "percentRate", label: string) => (
    <div>
      <label className="mb-1 block text-xs text-white/50">{label}</label>
      <input type="number" min={0} value={c[field] || ""} onChange={(e) => onChange({ ...c, [field]: Number(e.target.value) || 0 })}
        onBlur={(e) => onSave({ [field]: Number(e.target.value) || 0 })} className={`${inputCls} w-full`} />
    </div>
  );
  const paidHint = c.dealType === "percent" ? "בעסקת אחוזים, הסימון מתייחס להתחשבנות השוטפת"
    : c.dealType === "retainer" ? "הסימון מתייחס לריטיינר השוטף" : "הסימון מתייחס לתשלום ההקמה או העסקה";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 lg:p-8" onClick={onClose}>
      <div dir="rtl" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0d0c0a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/10 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{c.name}</h2>
            <p className="text-sm text-white/50">{c.business}</p>
          </div>
          <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className={`${cardCls} p-4`}>
            <div className="mb-3 text-sm font-medium text-white/80">פרטי הלקוח</div>
            <div className="grid grid-cols-2 gap-3">
              {text("name", "שם")}{text("business", "עסק")}{text("phone", "טלפון")}{text("email", "מייל")}
              <div>
                <label className="mb-1 block text-xs text-white/50">שלב בתהליך</label>
                <select value={c.stage} onChange={(e) => { onChange({ ...c, stage: e.target.value }); onSave({ stage: e.target.value }); }} className={`${inputCls} w-full`}>
                  {stages.map((s) => <option key={s} value={s} className="bg-black">{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/50">נסגר בתאריך</label>
                <div className="px-1 py-2 text-sm text-white/60">{fmtFull(c.createdAt)}</div>
              </div>
            </div>
          </div>

          <div className={`${cardCls} p-4`}>
            <div className="mb-3 text-sm font-medium text-white/80">מבנה העסקה</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-white/50">איך העסקה בנויה?</label>
                <select value={c.dealType} onChange={(e) => { onChange({ ...c, dealType: e.target.value }); onSave({ dealType: e.target.value }); }} className={`${inputCls} w-full`}>
                  {DEAL_TYPES.map((d) => <option key={d.value} value={d.value} className="bg-black">{d.label}</option>)}
                </select>
              </div>
              {c.dealType === "one_time" && amount("amountPaid", "שווי העסקה (חד פעמי) ₪")}
              {c.dealType === "setup_retainer" && amount("amountPaid", "הקמה חד פעמית ₪")}
              {(c.dealType === "retainer" || c.dealType === "setup_retainer") && amount("monthlyFee", "ריטיינר חודשי ₪")}
              {c.dealType === "percent" && amount("percentRate", "אחוז מהעסקאות %")}
              <div className="col-span-2 flex flex-wrap items-center gap-3">
                <button onClick={() => { onChange({ ...c, paid: !c.paid }); onSave({ paid: !c.paid }); }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${c.paid ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
                  {c.paid ? <><Check className="h-4 w-4" /> שילם</> : "לא שילם"}
                </button>
                <span className="text-xs text-white/40">{paidHint}</span>
              </div>
            </div>
          </div>

          <div className={`${cardCls} p-4`}>
            <div className="mb-2 text-sm font-medium text-white/80">תיעוד והערות</div>
            <textarea rows={4} placeholder="תיעוד התהליך: מה סוכם, מה נשלח, מה הצעד הבא..." value={c.notes}
              onChange={(e) => onChange({ ...c, notes: e.target.value })} onBlur={(e) => onSave({ notes: e.target.value })}
              className={`${inputCls} w-full resize-none`} />
          </div>

          {c.sourceChatId && onOpenSourceChat && (
            <button onClick={onOpenSourceChat} className="inline-flex items-center gap-1.5 text-sm text-brand-gold hover:underline">
              <MessagesSquare className="h-4 w-4" /> צפייה בשיחה המקורית מהמשפך
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
