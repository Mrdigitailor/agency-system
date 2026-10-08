"use client";

import { useState } from "react";
import { ArrowLeft, MousePointerClick, MessageSquare, Handshake } from "lucide-react";
import GoogleG from "./GoogleG";

// הנחות הדוגמה במחשבון: אותן הנחות שמרניות שהדוח האמיתי משתמש בהן (verdict.ts)
const EXAMPLE = { field: "ייעוץ משכנתאות", cpc: 12.5, pageConv: 0.05, closeRate: 0.05, deal: 12000 };
const nis = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

// מחשבון ההחזר: מזיזים את התקציב ורואים את כל הדרך, מהקליק ועד ההכנסה
export default function ReturnCalculator() {
  const [budget, setBudget] = useState(6000);
  const clicks = budget / EXAMPLE.cpc;
  const leads = clicks * EXAMPLE.pageConv;
  const deals = leads * EXAMPLE.closeRate;
  const revenue = deals * EXAMPLE.deal;
  const ratio = revenue / budget;
  // רוחב העמודות ביחס לערך הגדול ביותר האפשרי במחשבון, כדי שהגדילה תיראה לעין
  const maxRevenue = (15000 / EXAMPLE.cpc) * EXAMPLE.pageConv * EXAMPLE.closeRate * EXAMPLE.deal;
  const steps = [
    { icon: MousePointerClick, label: "קליקים", value: Math.round(clicks).toLocaleString("he-IL") },
    { icon: MessageSquare, label: "פניות", value: `כ-${Math.round(leads)}` },
    { icon: Handshake, label: "עסקאות", value: `כ-${deals.toFixed(1)}` },
  ];

  return (
    <div className="rounded-2xl border border-[#272319] bg-[#12100c] p-5 shadow-2xl sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white"><GoogleG className="h-5 w-5" /></span>
          <h2 className="text-lg font-semibold text-[#f4f0e7]">מחשבון החזר</h2>
        </div>
        <span className="rounded-full border border-[#3a3324] px-2.5 py-1 text-xs text-[#a39c8d]">דוגמה: {EXAMPLE.field}</span>
      </div>

      <label htmlFor="budget" className="mt-6 flex items-baseline justify-between">
        <span className="text-sm text-[#a39c8d]">תקציב פרסום חודשי</span>
        <span className="text-2xl font-semibold tabular-nums text-[#f4f0e7]">{nis(budget)}</span>
      </label>
      <input id="budget" type="range" min={3000} max={15000} step={500} value={budget}
        onChange={(e) => setBudget(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[#272319] accent-[#eed89b]" />

      <div className="mt-6 grid grid-cols-3 gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className="relative rounded-lg bg-[#0a0908] px-2 py-3 text-center">
            <s.icon className="mx-auto h-4 w-4 text-brand-gold" />
            <div className="mt-1.5 text-xl font-semibold tabular-nums text-[#f4f0e7]">{s.value}</div>
            <div className="text-xs text-[#7e776a]">{s.label}</div>
            {i < steps.length - 1 && <ArrowLeft aria-hidden className="absolute -left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#4e4227]" />}
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <div className="flex items-baseline justify-between text-sm"><span className="text-[#a39c8d]">השקעה</span><span className="tabular-nums text-[#c9c2b3]">{nis(budget)}</span></div>
          <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full">
            <rect width="100" height="4" fill="#1d1a14" />
            <rect x={100 - (budget / maxRevenue) * 100} width={(budget / maxRevenue) * 100} height="4" fill="#7e776a" />
          </svg>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm"><span className="text-[#a39c8d]">הכנסה צפויה</span><span className="text-lg font-semibold tabular-nums text-brand-gold">{nis(revenue)}</span></div>
          <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full">
            <rect width="100" height="4" fill="#1d1a14" />
            <rect x={100 - (revenue / maxRevenue) * 100} width={(revenue / maxRevenue) * 100} height="4" fill="#eed89b" />
          </svg>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-lg border border-dashed border-brand-gold/50 px-4 py-3">
        <span className="text-sm text-[#c9c2b3]">על כל שקל שהושקע</span>
        <span className="text-2xl font-semibold tabular-nums text-brand-gold">{ratio.toFixed(1)} ₪ חזרה</span>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[#7e776a]">
        הנחות הדוגמה: {EXAMPLE.cpc} ₪ לקליק, 5 מכל 100 מבקרים פונים, פנייה אחת מכל 20 נסגרת, עסקה של {nis(EXAMPLE.deal)}. את המספרים של התחום שלכם מקבלים בצ&apos;אט.
      </p>
    </div>
  );
}
