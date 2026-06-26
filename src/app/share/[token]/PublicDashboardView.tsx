"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { WidgetGrid, type WidgetDTO } from "@/components/dashboard/DashboardWidgets";

interface Dto {
  client: { name: string; currency: string; clientType: string };
  range: { since: string; until: string };
  widgets: WidgetDTO[];
}

const RANGES = [
  { key: "month", label: "החודש" },
  { key: "7", label: "7 ימים" },
  { key: "28", label: "28 ימים" },
  { key: "90", label: "90 ימים" },
];

function rangeParams(key: string): string {
  const today = new Date();
  const until = today.toISOString().slice(0, 10);
  if (key === "month") {
    const since = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    return `since=${since}&until=${until}`;
  }
  const since = new Date(today.getTime() - (Number(key) - 1) * 86400000).toISOString().slice(0, 10);
  return `since=${since}&until=${until}`;
}

export default function PublicDashboardView({ token }: { token: string }) {
  const [dto, setDto] = useState<Dto | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [range, setRange] = useState("month");

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/dashboard/${token}?${rangeParams(key)}`);
      if (!res.ok) { setUnavailable(true); return; }
      setDto(await res.json());
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(range); }, [load, range]);

  if (unavailable) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-brand-dark">הדשבורד אינו זמין</p>
        <p className="mt-2 text-sm text-brand-muted">ייתכן שהקישור בוטל או שגוי. פנה לסוכנות לקבלת קישור מעודכן.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">{dto?.client.name ?? ""}</h1>
        <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light p-0.5">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r.key ? "bg-brand-gold text-brand-dark" : "text-brand-muted hover:text-brand-dark"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {loading && !dto ? (
        <div className="flex items-center justify-center py-20 text-brand-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : dto ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <WidgetGrid widgets={dto.widgets} currency={dto.client.currency} />
        </div>
      ) : null}
    </div>
  );
}
