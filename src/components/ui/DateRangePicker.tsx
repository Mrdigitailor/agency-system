"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  label: string;
}

function toDateStr(d: Date): string {
  // שימוש בתאריך מקומי ולא UTC — מונע באג timezone
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function getPresetRange(preset: string): DateRange {
  const today = new Date();
  const yday = daysAgo(1);

  switch (preset) {
    case "today":
      return { since: toDateStr(today), until: toDateStr(today), label: "היום" };
    case "7d":
      return { since: toDateStr(daysAgo(7)), until: toDateStr(yday), label: "7 ימים אחרונים" };
    case "30d":
      return { since: toDateStr(daysAgo(30)), until: toDateStr(yday), label: "30 ימים אחרונים" };
    case "90d":
      return { since: toDateStr(daysAgo(90)), until: toDateStr(yday), label: "90 ימים אחרונים" };
    case "this_month":
      return { since: toDateStr(startOfMonth(today)), until: toDateStr(today), label: "החודש הנוכחי" };
    case "last_month": {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { since: toDateStr(startOfMonth(lastMonth)), until: toDateStr(endOfMonth(lastMonth)), label: "החודש הקודם" };
    }
    default:
      return { since: toDateStr(startOfMonth(today)), until: toDateStr(today), label: "החודש הנוכחי" };
  }
}

const PRESETS = [
  { id: "today", label: "היום" },
  { id: "7d", label: "7 ימים" },
  { id: "30d", label: "30 ימים" },
  { id: "90d", label: "90 ימים" },
  { id: "this_month", label: "החודש הנוכחי" },
  { id: "last_month", label: "החודש הקודם" },
];

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customSince, setCustomSince] = useState(value.since);
  const [customUntil, setCustomUntil] = useState(value.until);

  const handlePreset = (presetId: string) => {
    onChange(getPresetRange(presetId));
    setOpen(false);
  };

  const handleCustom = () => {
    if (!customSince || !customUntil) return;
    const sinceDate = new Date(customSince);
    const untilDate = new Date(customUntil);
    const label = `${sinceDate.toLocaleDateString("he-IL")} - ${untilDate.toLocaleDateString("he-IL")}`;
    onChange({ since: customSince, until: customUntil, label });
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-light px-4 py-2 text-sm text-brand-dark transition-colors duration-200 hover:bg-brand-bg"
      >
        <Calendar className="h-4 w-4 text-brand-muted" />
        <span>{value.label}</span>
        <ChevronDown className="h-4 w-4 text-brand-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-lg border border-brand-border bg-brand-light p-3 shadow-lg">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p.id)}
                  className="rounded-lg border border-brand-border px-3 py-2 text-xs text-brand-dark hover:bg-brand-bg hover:border-brand-gold"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border-t border-brand-border pt-3">
              <p className="mb-2 text-xs font-medium text-brand-muted">טווח מותאם:</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-brand-muted">מ:</label>
                  <input
                    type="date"
                    value={customSince}
                    onChange={(e) => setCustomSince(e.target.value)}
                    className="mt-1 w-full rounded border border-brand-border bg-brand-bg px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-brand-muted">עד:</label>
                  <input
                    type="date"
                    value={customUntil}
                    onChange={(e) => setCustomUntil(e.target.value)}
                    className="mt-1 w-full rounded border border-brand-border bg-brand-bg px-2 py-1 text-xs"
                  />
                </div>
                <button
                  onClick={handleCustom}
                  className="w-full rounded-lg bg-brand-gold px-3 py-2 text-xs font-medium text-brand-dark hover:bg-brand-gold/80"
                >
                  החל טווח
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
