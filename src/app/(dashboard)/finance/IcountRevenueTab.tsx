"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

// טאב הכנסות לקוחות מ-iCount — סיכום חשבוניות פר לקוח (אדמין בלבד)
// כל הסכומים מופרדים: ללא מע"מ / מע"מ / כולל מע"מ

interface RevenueRow {
  clientId: string;
  name: string;
  status: string;
  monthlyRetainer: number;
  dealType: string;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  yearNet: number;
  yearGross: number;
  docCount: number;
  firstDocDate: string;
  lastDocDate: string;
}

interface RevenueData {
  rows: RevenueRow[];
  unlinked: string[];
  syncedAt: string | null;
}

const cardClass = "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency", currency: "ILS", maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** מספר חודשים (כולל) בין שני תאריכי ISO — לממוצע חודשי */
function monthsBetween(from: string, to: string): number {
  if (!from || !to) return 1;
  const a = new Date(from), b = new Date(to);
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
}

/** האם עברו יותר מ-45 יום מהחשבונית האחרונה (ללקוח פעיל) */
function invoiceGap(lastDocDate: string): boolean {
  if (!lastDocDate) return false;
  return Date.now() - new Date(lastDocDate).getTime() > 45 * 24 * 60 * 60 * 1000;
}

export default function IcountRevenueTab() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/icount/revenue");
      if (res.ok) setData(await res.json());
      else setError("שגיאה בטעינת נתוני iCount");
    } catch {
      setError("שגיאה בטעינת נתוני iCount");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch("/api/finance/icount/revenue-sync");
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) setError("הסנכרון נכשל, נסה שוב");
      else await fetchData();
    } catch {
      setError("הסנכרון נכשל, נסה שוב");
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totalNet = useMemo(() => rows.reduce((s, r) => s + r.totalNet, 0), [rows]);
  const totalVat = useMemo(() => rows.reduce((s, r) => s + r.totalVat, 0), [rows]);
  const totalGross = useMemo(() => rows.reduce((s, r) => s + r.totalGross, 0), [rows]);
  const yearNet = useMemo(() => rows.reduce((s, r) => s + r.yearNet, 0), [rows]);
  const monthsThisYear = new Date().getMonth() + 1;
  const thisYear = new Date().getFullYear();

  const thClass = "whitespace-nowrap px-3 py-2 text-xs font-medium text-brand-muted text-right";
  const tdClass = "whitespace-nowrap px-3 py-2 text-sm";

  if (loading) {
    return <p className="py-8 text-center text-sm text-brand-muted">טוען נתוני iCount...</p>;
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className={cardClass}>
          <p className="text-xs font-medium text-brand-muted">סה״כ ללא מע״מ (מאז ומעולם)</p>
          <p className="mt-1 text-xl font-semibold text-brand-dark">{fmt(totalNet)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-medium text-brand-muted">סה״כ מע״מ</p>
          <p className="mt-1 text-xl font-semibold text-brand-muted">{fmt(totalVat)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-medium text-brand-muted">סה״כ כולל מע״מ</p>
          <p className="mt-1 text-xl font-semibold text-brand-dark">{fmt(totalGross)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-medium text-brand-muted">{thisYear} ללא מע״מ</p>
          <p className="mt-1 text-xl font-semibold text-brand-dark">{fmt(yearNet)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs font-medium text-brand-muted">ממוצע חודשי {thisYear} (ללא מע״מ)</p>
          <p className="mt-1 text-xl font-semibold text-brand-dark">{fmt(yearNet / monthsThisYear)}</p>
        </div>
      </div>

      {/* כותרת + רענון */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-brand-muted">
          הנתונים מסונכרנים מחשבוניות iCount (שני החשבונות, בניכוי זיכויים ומבוטלות)
          {data?.syncedAt && ` · עודכן ${new Date(data.syncedAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}`}
        </p>
        <button
          onClick={runSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors hover:bg-brand-gold/80 disabled:opacity-60"
        >
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          {syncing ? "מסנכרן..." : "רענון מ-iCount"}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* טבלה */}
      <div className={cardClass}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px]">
            <thead>
              <tr className="border-b border-brand-border">
                <th className={thClass}>לקוח</th>
                <th className={thClass}>ללא מע״מ</th>
                <th className={thClass}>מע״מ</th>
                <th className={thClass}>כולל מע״מ</th>
                <th className={thClass}>{thisYear} (ללא מע״מ)</th>
                <th className={thClass}>ממוצע חודשי</th>
                <th className={thClass}>ריטיינר מוגדר</th>
                <th className={thClass}>חשבוניות</th>
                <th className={thClass}>תחילת עבודה</th>
                <th className={thClass}>חשבונית אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const gap = r.status === "active" && invoiceGap(r.lastDocDate);
                const monthlyAvg = r.totalNet / monthsBetween(r.firstDocDate, r.lastDocDate);
                return (
                  <tr key={r.clientId} className="border-b border-brand-border last:border-0 hover:bg-brand-bg/50">
                    <td className={tdClass + " font-medium text-brand-dark"}>{r.name}</td>
                    <td className={tdClass + " font-semibold"}>{fmt(r.totalNet)}</td>
                    <td className={tdClass + " text-brand-muted"}>{fmt(r.totalVat)}</td>
                    <td className={tdClass}>{fmt(r.totalGross)}</td>
                    <td className={tdClass}>{r.yearNet ? fmt(r.yearNet) : "—"}</td>
                    <td className={tdClass + " text-brand-muted"}>{fmt(monthlyAvg)}</td>
                    <td className={tdClass + " text-brand-muted"}>{r.monthlyRetainer ? fmt(r.monthlyRetainer) : "—"}</td>
                    <td className={tdClass}>{r.docCount}</td>
                    <td className={tdClass}>{fmtDate(r.firstDocDate)}</td>
                    <td className={tdClass}>
                      <span className="inline-flex items-center gap-1">
                        {fmtDate(r.lastDocDate)}
                        {gap && (
                          <span title="עברו יותר מ-45 יום מהחשבונית האחרונה">
                            <AlertTriangle size={14} className="text-amber-500" />
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-brand-muted">
                    אין עדיין נתונים — לחץ על &quot;רענון מ-iCount&quot;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* לקוחות בלי קישור */}
      {data && data.unlinked.length > 0 && (
        <p className="text-xs text-brand-muted">
          לקוחות פעילים ללא כרטיס iCount מקושר: {data.unlinked.join(", ")}
        </p>
      )}
    </div>
  );
}
