"use client";

// דוחות פוטנציאל — מחולל פנימי: ממלאים את נתוני המתעניין, המחקר רץ, ומתקבל קישור לדוח ממותג.
// בהמשך סוכן הצ'אט בדף הנחיתה ימלא את הטופס הזה אוטומטית.
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Copy, ExternalLink, Loader2 } from "lucide-react";

interface ReportRow {
  id: string; status: string; businessName: string; serviceField: string;
  budget: number; headline: string; error: string; link: string; createdAt: string; meetingAt: string | null;
}

const inputClass = "w-full rounded-lg border border-brand-border bg-brand-light px-3 py-2.5 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold";
const labelClass = "mb-1 block text-sm font-medium text-brand-dark";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ready: { text: "מוכן", cls: "bg-brand-success/10 text-brand-success" },
  pending: { text: "בהכנה", cls: "bg-brand-info/10 text-brand-info" },
  no_data: { text: "אין נתונים", cls: "bg-brand-warning/10 text-brand-warning" },
  failed: { text: "נכשל", cls: "bg-brand-danger/10 text-brand-danger" },
};

export default function PotentialPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ link: string; status: string; reason?: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [f, setF] = useState({
    businessName: "", serviceField: "", serviceArea: "", budget: "",
    paymentType: "one_time", dealFirst: "", monthlyFee: "", lifetimeMonths: "12",
    contactName: "", contactPhone: "", contactEmail: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/prospect-reports");
      if (res.ok) setRows(await res.json());
    } catch { /* רשימה היא נוחות, לא קריטי */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    setError(""); setResult(null);
    if (!f.serviceField.trim()) { setError("חסר תחום/שירות"); return; }
    if (!Number(f.budget)) { setError("חסר תקציב פרסום"); return; }
    if (!Number(f.dealFirst) && !(f.paymentType === "retainer" && Number(f.monthlyFee))) { setError("חסר שווי עסקה (או ריטיינר חודשי)"); return; }
    setRunning(true);
    try {
      const res = await fetch("/api/prospect-reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, budget: Number(f.budget), dealFirst: Number(f.dealFirst), monthlyFee: Number(f.monthlyFee), lifetimeMonths: Number(f.lifetimeMonths) }),
      });
      const json = await res.json();
      if (!res.ok && !json.link) { setError(json.error ?? "משהו השתבש"); return; }
      setResult(json);
      load();
    } catch { setError("משהו השתבש, נסו שוב"); }
    finally { setRunning(false); }
  };

  const copy = (link: string) => {
    navigator.clipboard?.writeText(link).then(() => { setCopied(link); setTimeout(() => setCopied(""), 1500); }).catch(() => {});
  };

  const isRetainer = f.paymentType === "retainer";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-brand-gold" />
        <div>
          <h1 className="text-xl font-semibold text-brand-dark">דוחות פוטנציאל</h1>
          <p className="text-sm text-brand-muted">מחקר חי מגוגל + שרשרת חישוב שמרנית = דוח ממותג עם קישור לשליחה</p>
        </div>
      </div>

      {/* טופס יצירה */}
      <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={labelClass}>שם העסק</label><input className={inputClass} value={f.businessName} onChange={set("businessName")} placeholder="לא חובה" /></div>
          <div><label className={labelClass}>תחום / שירות *</label><input className={inputClass} value={f.serviceField} onChange={set("serviceField")} placeholder="למשל: יועץ משכנתאות" /></div>
          <div><label className={labelClass}>אזור שירות</label><input className={inputClass} value={f.serviceArea} onChange={set("serviceArea")} placeholder="ריק = כל הארץ" /></div>
          <div><label className={labelClass}>תקציב פרסום חודשי (₪) *</label><input className={inputClass} type="number" value={f.budget} onChange={set("budget")} placeholder="8000" /></div>
          <div>
            <label className={labelClass}>מודל תשלום</label>
            <select className={inputClass} value={f.paymentType} onChange={set("paymentType")}>
              <option value="one_time">עסקה חד פעמית</option>
              <option value="retainer">ריטיינר חודשי</option>
            </select>
          </div>
          <div><label className={labelClass}>{isRetainer ? "דמי הקמה / עסקה ראשונה (₪)" : "שווי עסקה ממוצעת (₪)"}</label><input className={inputClass} type="number" value={f.dealFirst} onChange={set("dealFirst")} placeholder="14800" /></div>
          {isRetainer && (
            <>
              <div><label className={labelClass}>ריטיינר חודשי (₪)</label><input className={inputClass} type="number" value={f.monthlyFee} onChange={set("monthlyFee")} placeholder="800" /></div>
              <div><label className={labelClass}>אורך חיי לקוח (חודשים)</label><input className={inputClass} type="number" value={f.lifetimeMonths} onChange={set("lifetimeMonths")} /></div>
            </>
          )}
          <div><label className={labelClass}>איש קשר</label><input className={inputClass} value={f.contactName} onChange={set("contactName")} placeholder="לא חובה" /></div>
          <div><label className={labelClass}>טלפון</label><input className={inputClass} value={f.contactPhone} onChange={set("contactPhone")} placeholder="לא חובה" /></div>
          <div><label className={labelClass}>אימייל</label><input className={inputClass} type="email" value={f.contactEmail} onChange={set("contactEmail")} placeholder="מאפשר זיהוי אוטומטי כשהוא קובע פגישה" /></div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-brand-danger">{error}</p>}
        {result && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand-gold/50 bg-brand-gold/10 px-4 py-3 text-sm">
            {result.status === "ready" ? (
              <>
                <span className="font-semibold text-brand-dark">הדוח מוכן ✓</span>
                <a href={result.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-dark underline"><ExternalLink className="h-3.5 w-3.5" /> פתח</a>
                <button onClick={() => copy(result.link)} className="inline-flex items-center gap-1 text-brand-dark underline"><Copy className="h-3.5 w-3.5" /> {copied === result.link ? "הועתק!" : "העתק קישור"}</button>
              </>
            ) : (
              <span className="text-brand-dark">אין מספיק נתונים לתחום הזה{result.reason ? ` (${result.reason})` : ""}. מומלץ מסלול שיחה.</span>
            )}
          </div>
        )}

        <button onClick={submit} disabled={running}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-gold px-6 py-2.5 text-sm font-bold text-brand-dark transition-all hover:brightness-95 disabled:opacity-60">
          {running ? (<><Loader2 className="h-4 w-4 animate-spin" /> מריץ מחקר חי מגוגל...</>) : "צור דוח פוטנציאל"}
        </button>
      </div>

      {/* רשימת דוחות */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-light shadow-sm">
          <table className="w-full min-w-130 text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg text-right text-xs text-brand-muted">
                <th className="px-4 py-2.5 font-medium">עסק / תחום</th>
                <th className="px-4 py-2.5 font-medium">תקציב</th>
                <th className="px-4 py-2.5 font-medium">פוטנציאל חודשי</th>
                <th className="px-4 py-2.5 font-medium">סטטוס</th>
                <th className="px-4 py-2.5 font-medium">פגישה</th>
                <th className="px-4 py-2.5 font-medium">קישור</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.pending;
                return (
                  <tr key={r.id} className="border-b border-brand-border/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-brand-dark">{r.businessName || r.serviceField}</div>
                      {r.businessName && <div className="text-xs text-brand-muted">{r.serviceField}</div>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-brand-dark">₪{r.budget.toLocaleString("he-IL")}</td>
                    <td className="px-4 py-2.5 tabular-nums font-medium text-brand-dark">{r.headline || "-"}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span></td>
                    <td className="px-4 py-2.5 text-xs text-brand-dark">{r.meetingAt ? `📅 ${new Date(r.meetingAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} ${new Date(r.meetingAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : <span className="text-brand-muted">-</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <a href={r.link} target="_blank" rel="noreferrer" title="פתח" className="text-brand-muted hover:text-brand-dark"><ExternalLink className="h-4 w-4" /></a>
                        <button onClick={() => copy(r.link)} title="העתק" className="text-brand-muted hover:text-brand-dark"><Copy className="h-4 w-4" /></button>
                        {copied === r.link && <span className="text-xs text-brand-success">הועתק</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
