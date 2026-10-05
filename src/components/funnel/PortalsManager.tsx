"use client";

// ניהול פורטלי הלקוחות (אדמין): כל לקוח מקבל פורטל משלו.
// יצירת פורטל חדש, העתקת הקישור, חיבור ללקוח במערכת (לנתוני הקמפיינים), ואיפוס סיסמה.
import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Plus, KeyRound, Loader2, Trash2, ExternalLink } from "lucide-react";

interface Portal {
  id: string; name: string; slug: string; isDefault: boolean; link: string; chatLink: string;
  clientId: string; clientName: string; ownerEmail: string; hasPassword: boolean; chats: number;
}
interface ClientOption { id: string; name: string }

const inputCls = "w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:outline-none";

export default function PortalsManager() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", ownerEmail: "", clientId: "", slug: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; action: "resetPassword" | "remove" } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/funnel/portals");
      if (!res.ok) { setAllowed(false); return; }
      const d = await res.json();
      setPortals(d.portals ?? []); setClients(d.clients ?? []); setAllowed(true);
    } catch { setAllowed(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1800); } catch { /* הדפדפן חסם */ }
  };

  const create = async () => {
    setError("");
    if (!f.name.trim()) { setError("חסר שם"); return; }
    setBusy(true);
    const res = await fetch("/api/funnel/portals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "היצירה נכשלה"); return; }
    setAdding(false); setF({ name: "", ownerEmail: "", clientId: "", slug: "" });
    load();
  };

  const patch = async (body: Record<string, unknown>) => {
    await fetch("/api/funnel/portals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setConfirm(null);
    load();
  };

  if (!allowed) return null; // מנהלים שאינם אדמין לא רואים את האזור הזה

  return (
    <div className="rounded-lg border border-brand-border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-brand-dark">פורטלי לקוחות</div>
          <div className="mt-0.5 text-sm text-brand-muted">כל לקוח מקבל מערכת משלו בקישור נפרד, ורואה רק את הלידים שלו. בכניסה הראשונה הוא קובע סיסמה.</div>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-all duration-200 hover:brightness-95">
            <Plus className="h-4 w-4" /> פורטל ללקוח חדש
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-4 grid gap-3 rounded-lg border border-brand-border bg-brand-light/50 p-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-brand-muted">שם העסק *</label>
            <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-brand-muted">מייל להתראות</label>
            <input type="email" dir="ltr" value={f.ownerEmail} onChange={(e) => setF((p) => ({ ...p, ownerEmail: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-brand-muted">לקוח במערכת (לנתוני הקמפיינים)</label>
            <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))} className={inputCls}>
              <option value="">בלי חיבור</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-brand-muted">מזהה לדף הצ&apos;אט (באנגלית)</label>
            <input dir="ltr" value={f.slug} onChange={(e) => setF((p) => ({ ...p, slug: e.target.value.toLowerCase() }))} placeholder="cohen-law" className={inputCls} />
          </div>
          {error && <div className="text-sm text-brand-danger md:col-span-4">{error}</div>}
          <div className="flex justify-end gap-2 md:col-span-4">
            <button onClick={() => { setAdding(false); setError(""); }} className="rounded-lg px-4 py-2 text-sm text-brand-muted hover:text-brand-dark">ביטול</button>
            <button onClick={create} disabled={busy || !f.name.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-5 py-2 text-sm font-medium text-brand-dark disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "יצירה"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-brand-border text-xs text-brand-muted">
              <th className="px-3 py-2 font-medium">פורטל</th>
              <th className="px-3 py-2 font-medium">לקוח מחובר</th>
              <th className="px-3 py-2 font-medium">מייל להתראות</th>
              <th className="px-3 py-2 font-medium">שיחות</th>
              <th className="px-3 py-2 font-medium">סיסמה</th>
              <th className="px-3 py-2 font-medium">קישורים ופעולות</th>
            </tr>
          </thead>
          <tbody>
            {portals.map((p) => (
              <tr key={p.id} className="border-b border-brand-border/60 align-middle">
                <td className="px-3 py-3">
                  <div className="font-medium text-brand-dark">{p.name}</div>
                  {p.isDefault && <div className="text-xs text-brand-muted">המשפך שלנו</div>}
                </td>
                <td className="px-3 py-3">
                  <select value={p.clientId} onChange={(e) => patch({ id: p.id, clientId: e.target.value })}
                    className="rounded-lg border border-brand-border bg-white px-2 py-1.5 text-xs text-brand-dark focus:border-brand-gold focus:outline-none">
                    <option value="">בלי חיבור</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3 text-xs text-brand-muted" dir="ltr">{p.ownerEmail || "-"}</td>
                <td className="px-3 py-3 text-brand-muted">{p.chats}</td>
                <td className="px-3 py-3 text-xs">
                  {p.hasPassword ? <span className="text-brand-success">הוגדרה</span> : <span className="text-brand-warning">ממתין לכניסה ראשונה</span>}
                </td>
                <td className="px-3 py-3">
                  {confirm?.id === p.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span className="text-brand-dark">{confirm.action === "remove" ? "להסיר את הפורטל? הקישור יפסיק לעבוד." : "לאפס סיסמה? הלקוח יקבע חדשה בכניסה הבאה."}</span>
                      <button onClick={() => patch({ id: p.id, action: confirm.action })} className="rounded bg-brand-danger px-2.5 py-1 font-medium text-white">אישור</button>
                      <button onClick={() => setConfirm(null)} className="text-brand-muted hover:text-brand-dark">ביטול</button>
                    </span>
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <button onClick={() => copy(p.link, `l-${p.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-brand-border px-2.5 py-1.5 text-xs text-brand-dark transition-colors duration-200 hover:bg-brand-light">
                        {copied === `l-${p.id}` ? <Check className="h-3.5 w-3.5 text-brand-success" /> : <Copy className="h-3.5 w-3.5" />} קישור למערכת
                      </button>
                      {p.chatLink && (
                        <button onClick={() => copy(p.chatLink, `c-${p.id}`)} className="inline-flex items-center gap-1 rounded-lg border border-brand-border px-2.5 py-1.5 text-xs text-brand-dark transition-colors duration-200 hover:bg-brand-light">
                          {copied === `c-${p.id}` ? <Check className="h-3.5 w-3.5 text-brand-success" /> : <Copy className="h-3.5 w-3.5" />} קישור לצ&apos;אט
                        </button>
                      )}
                      <a href={p.link} target="_blank" rel="noreferrer" title="פתיחה" aria-label="פתיחת הפורטל" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-light hover:text-brand-dark"><ExternalLink className="h-4 w-4" /></a>
                      {p.hasPassword && (
                        <button onClick={() => setConfirm({ id: p.id, action: "resetPassword" })} title="איפוס סיסמה" aria-label="איפוס סיסמה" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-light hover:text-brand-dark"><KeyRound className="h-4 w-4" /></button>
                      )}
                      {!p.isDefault && (
                        <button onClick={() => setConfirm({ id: p.id, action: "remove" })} title="הסרה" aria-label="הסרת הפורטל" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-light hover:text-brand-danger"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
