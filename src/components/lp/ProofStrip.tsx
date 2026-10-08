"use client";

// הוכחה מהירה: שלושה מספרים שרצים למעלה כשמגיעים אליהם, ותג השותף
import PartnerChip from "./PartnerChip";
import { useCountUp } from "./useCountUp";
import { useInView } from "./useInView";

function Stat({ target, suffix, label, run }: { target: number; suffix: string; label: string; run: boolean }) {
  const v = useCountUp(target, run, 1400);
  return (
    <div className="text-center">
      <div dir="ltr" className="text-5xl font-semibold tabular-nums text-brand-gold sm:text-6xl">{Math.round(v).toLocaleString("he-IL")}{suffix}</div>
      <div className="mt-2 text-sm text-[#a39c8d] sm:text-base">{label}</div>
    </div>
  );
}

export default function ProofStrip() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    <section className="border-y border-[#1d1a14] bg-black">
      <div ref={ref} className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-14 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:px-8">
        <Stat target={10} suffix="" label="שנים של פרסום בגוגל" run={inView} />
        <Stat target={350} suffix="+" label="עסקים שהסוכנות ליוותה" run={inView} />
        <Stat target={8} suffix="M ₪" label="תקציבי פרסום שמנוהלים בשנה" run={inView} />
        <div className="flex justify-center sm:col-span-3 lg:col-span-1"><PartnerChip /></div>
      </div>
    </section>
  );
}
