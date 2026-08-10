"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getCurrencySymbol } from "@/lib/utils/currency";

// טבלת מגמה — לכל קמפיין: המרות + עלות להמרה בחלונות 3/7/14/21 ימים.
// מושכת מאותו endpoint של הקמפיינים (4 חלונות) וממזגת לפי שם — אפס לוגיקת המרות חדשה.

const WINDOWS = [3, 7, 14, 21] as const;

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// חלון של N ימים שלמים המסתיים אתמול — היום עדיין חלקי (הסנכרון לא הושלם)
// ומעוות את המספרים. כך "3 ימים" = 3 הימים המלאים האחרונים, כמצופה.
function lastNDays(n: number): { since: string; until: string } {
  const now = new Date();
  const until = new Date(now.getTime() - 86400000); // אתמול
  const since = new Date(until.getTime() - (n - 1) * 86400000);
  return { since: toDateStr(since), until: toDateStr(until) };
}

interface Cell { conv: number; cpa: number; spend: number }
interface Row { name: string; w: Partial<Record<number, Cell>> }
interface Campaign { name: string; conversions?: number; costPerConversion?: number; spend?: number }

export default function CampaignTrendTable({ clientId, endpoint, currency }: { clientId: string; endpoint: string; currency: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const sym = getCurrencySymbol(currency);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        WINDOWS.map(async (n) => {
          const { since, until } = lastNDays(n);
          const res = await fetch(`/api/clients/${clientId}/${endpoint}?since=${since}&until=${until}`);
          const data = res.ok ? await res.json() : { campaigns: [] };
          return { n, campaigns: (data.campaigns ?? []) as Campaign[] };
        }),
      );
      const map = new Map<string, Row>();
      for (const { n, campaigns } of results) {
        for (const c of campaigns) {
          if (!c.name) continue;
          if (!map.has(c.name)) map.set(c.name, { name: c.name, w: {} });
          map.get(c.name)!.w[n] = { conv: c.conversions ?? 0, cpa: c.costPerConversion ?? 0, spend: c.spend ?? 0 };
        }
      }
      // רק קמפיינים עם פעילות (המרה או הוצאה) ב-21 יום; מיון לפי המרות 21 יום
      const arr = [...map.values()]
        .filter((r) => (r.w[21]?.conv ?? 0) > 0 || (r.w[21]?.spend ?? 0) > 0)
        .sort((a, b) => (b.w[21]?.conv ?? 0) - (a.w[21]?.conv ?? 0));
      setRows(arr);
    } finally {
      setLoading(false);
    }
  }, [clientId, endpoint]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

  // מגמת עלות להמרה: משווה חלון 3 ימים מול 21 ימים. יורד = משתפר (ירוק)
  function trendIcon(r: Row) {
    const short = r.w[3]?.cpa ?? 0;
    const long = r.w[21]?.cpa ?? 0;
    if (short <= 0 || long <= 0) return <Minus className="h-3.5 w-3.5 text-brand-muted" />;
    const diff = (short - long) / long;
    if (diff < -0.05) return <TrendingDown className="h-3.5 w-3.5 text-brand-success" />; // זול יותר לאחרונה
    if (diff > 0.05) return <TrendingUp className="h-3.5 w-3.5 text-brand-danger" />; // יקר יותר לאחרונה
    return <Minus className="h-3.5 w-3.5 text-brand-muted" />;
  }

  return (
    <div className="rounded-lg border border-brand-border bg-brand-light shadow-sm">
      <div className="flex items-center justify-between border-b border-brand-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-brand-dark">מגמת קמפיינים — המרות ועלות להמרה</h3>
          <p className="mt-0.5 text-xs text-brand-muted">חלונות מתגלגלים של 3 / 7 / 14 / 21 ימים שלמים (עד אתמול) — לזיהוי לאן להסתכל</p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-brand-muted" />}
      </div>

      {!loading && (!rows || rows.length === 0) ? (
        <p className="px-5 py-8 text-center text-sm text-brand-muted">אין קמפיינים עם פעילות ב-21 הימים האחרונים.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/50 text-xs text-brand-muted">
                <th className="px-4 py-2.5 text-right font-medium">קמפיין</th>
                <th className="w-4 px-1 py-2.5"></th>
                {WINDOWS.map((n) => (
                  <th key={n} className="px-4 py-2.5 text-center font-medium">{n} ימים</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.name} className="border-b border-brand-border/60 last:border-0 hover:bg-brand-bg/30">
                  <td className="max-w-[220px] truncate px-4 py-3 font-medium text-brand-dark" title={r.name}>{r.name}</td>
                  <td className="px-1 py-3 text-center">{trendIcon(r)}</td>
                  {WINDOWS.map((n) => {
                    const c = r.w[n];
                    return (
                      <td key={n} className="px-4 py-3 text-center">
                        {c && (c.conv > 0 || c.spend > 0) ? (
                          <>
                            <div className="font-semibold text-brand-dark">{fmt(c.conv)} <span className="text-[10px] font-normal text-brand-muted">המרות</span></div>
                            <div className="mt-0.5 text-xs text-brand-muted">{c.conv > 0 ? `${sym}${fmt(c.cpa)} להמרה` : "—"}</div>
                          </>
                        ) : (
                          <span className="text-brand-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
