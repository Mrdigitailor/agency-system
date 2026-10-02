"use client";
import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// טאב פיננסים בתיקיית לקוח — אדמין בלבד.
// מרכז את כל הנתונים הפיננסיים של הלקוח מ-iCount: מתי התחיל, כמה נכנס ממנו
// עד היום (ללא מע"מ / מע"מ / כולל), תנאי ההתקשרות וכל החשבוניות.

interface FinanceSummary {
  totalNet: number;
  totalVat: number;
  totalGross: number;
  yearNet: number;
  yearVat: number;
  yearGross: number;
  docCount: number;
  firstDocDate: string;
  lastDocDate: string;
  syncedAt: string;
}

interface FinanceDoc {
  id: string;
  account: string;
  doctype: string;
  docnum: string;
  dateissued: string;
  beforeVat: number;
  vatAmount: number;
  withVat: number;
  remaining: number;
}

interface FinanceData {
  client: {
    name: string;
    monthlyRetainer: number;
    dealType: string;
    paymentCurrency: string;
    contractStartDate: string;
    specialTerms: string;
  };
  summary: FinanceSummary | null;
  openBalance: number;
  docs: FinanceDoc[];
}

const cardClass = "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";

const DOCTYPE_LABELS: Record<string, string> = {
  invoice: "חשבונית מס",
  invrec: "חשבונית מס קבלה",
  refund: "חשבונית זיכוי",
};

const DEAL_TYPE_LABELS: Record<string, string> = {
  retainer: "ריטיינר",
  retainer_plus_percentage: "ריטיינר + אחוזים",
  percentage_only: "אחוזים בלבד",
  retainer_or_percentage_higher: "ריטיינר או אחוזים (הגבוה)",
  project: "פרויקט",
  other: "אחר",
};

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

export default function ClientFinanceTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/clients/${clientId}/finance`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError("שגיאה בטעינת הנתונים הפיננסיים"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-brand-muted">טוען נתונים פיננסיים...</p>;
  }
  if (error || !data) {
    return <p className="py-8 text-center text-sm text-red-500">{error || "שגיאה"}</p>;
  }

  const s = data.summary;
  const thisYear = new Date().getFullYear();
  const monthlyAvg = s ? s.totalNet / monthsBetween(s.firstDocDate, s.lastDocDate) : 0;

  const thClass = "whitespace-nowrap px-3 py-2 text-xs font-medium text-brand-muted text-right";
  const tdClass = "whitespace-nowrap px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      {!s && (
        <div className={cardClass}>
          <p className="text-sm text-brand-muted">
            אין עדיין נתוני iCount ללקוח הזה — ייתכן שהכרטיס שלו עוד לא קושר.
            אפשר לקשר ולסנכרן מטאב &quot;הכנסות לקוחות&quot; בעמוד הפיננסים.
          </p>
        </div>
      )}

      {s && (
        <>
          {/* KPI — סיכום הכנסות */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className={cardClass}>
              <p className="text-xs font-medium text-brand-muted">סה״כ ללא מע״מ (מאז ומעולם)</p>
              <p className="mt-1 text-xl font-semibold text-brand-dark">{fmt(s.totalNet)}</p>
              <p className="mt-0.5 text-xs text-brand-muted">מע״מ: {fmt(s.totalVat)} · כולל: {fmt(s.totalGross)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs font-medium text-brand-muted">{thisYear} ללא מע״מ</p>
              <p className="mt-1 text-xl font-semibold text-brand-dark">{fmt(s.yearNet)}</p>
              <p className="mt-0.5 text-xs text-brand-muted">כולל מע״מ: {fmt(s.yearGross)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs font-medium text-brand-muted">ממוצע חודשי (ללא מע״מ)</p>
              <p className="mt-1 text-xl font-semibold text-brand-dark">{fmt(monthlyAvg)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs font-medium text-brand-muted">תחילת עבודה בפועל</p>
              <p className="mt-1 text-xl font-semibold text-brand-dark">{fmtDate(s.firstDocDate)}</p>
              <p className="mt-0.5 text-xs text-brand-muted">{s.docCount} חשבוניות</p>
            </div>
            <div className={cardClass}>
              <p className="text-xs font-medium text-brand-muted">יתרה פתוחה לגבייה</p>
              <p className={`mt-1 text-xl font-semibold ${data.openBalance > 0 ? "text-amber-500" : "text-brand-dark"}`}>
                {fmt(data.openBalance)}
              </p>
            </div>
          </div>

          {/* תנאי התקשרות */}
          <div className={cardClass}>
            <h3 className="mb-2 text-sm font-semibold text-brand-dark">תנאי התקשרות</h3>
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              <span className="text-brand-muted">
                ריטיינר מוגדר: <span className="font-medium text-brand-dark">{data.client.monthlyRetainer ? fmt(data.client.monthlyRetainer) : "—"}</span>
              </span>
              <span className="text-brand-muted">
                סוג עסקה: <span className="font-medium text-brand-dark">{DEAL_TYPE_LABELS[data.client.dealType] ?? data.client.dealType ?? "—"}</span>
              </span>
              <span className="text-brand-muted">
                חוזה מתאריך: <span className="font-medium text-brand-dark">{data.client.contractStartDate ? fmtDate(data.client.contractStartDate) : "—"}</span>
              </span>
              <span className="text-brand-muted">
                חשבונית אחרונה: <span className="font-medium text-brand-dark">{fmtDate(s.lastDocDate)}</span>
              </span>
            </div>
            {data.client.specialTerms && (
              <p className="mt-2 text-xs text-brand-muted">תנאים מיוחדים: {data.client.specialTerms}</p>
            )}
          </div>

          {/* רשימת מסמכים */}
          <div className={cardClass}>
            <h3 className="mb-2 text-sm font-semibold text-brand-dark">חשבוניות וזיכויים</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-brand-border">
                    <th className={thClass}>תאריך</th>
                    <th className={thClass}>מסמך</th>
                    <th className={thClass}>ללא מע״מ</th>
                    <th className={thClass}>מע״מ</th>
                    <th className={thClass}>כולל מע״מ</th>
                    <th className={thClass}>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {data.docs.map((d) => {
                    const isCredit = d.beforeVat < 0;
                    const unpaid = !isCredit && d.remaining > 0.01;
                    return (
                      <tr key={d.id} className="border-b border-brand-border last:border-0 hover:bg-brand-bg/50">
                        <td className={tdClass}>{fmtDate(d.dateissued)}</td>
                        <td className={tdClass}>
                          {DOCTYPE_LABELS[d.doctype] ?? d.doctype} {d.docnum}
                          {d.account === "old" && <span className="mr-1 text-xs text-brand-muted">(עוסק)</span>}
                        </td>
                        <td className={tdClass + (isCredit ? " text-red-500" : " font-medium")}>{fmt(d.beforeVat)}</td>
                        <td className={tdClass + " text-brand-muted"}>{fmt(d.vatAmount)}</td>
                        <td className={tdClass}>{fmt(d.withVat)}</td>
                        <td className={tdClass}>
                          {isCredit ? (
                            <span className="text-red-500">זיכוי</span>
                          ) : unpaid ? (
                            <span className="inline-flex items-center gap-1 text-amber-500">
                              <AlertTriangle size={14} />
                              יתרה {fmt(d.remaining)}
                            </span>
                          ) : (
                            <span className="text-green-600">שולם</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {data.docs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-brand-muted">אין מסמכים</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
