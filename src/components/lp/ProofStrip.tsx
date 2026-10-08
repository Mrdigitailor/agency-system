"use client";

// הוכחה מהירה: שלושה מספרים שרצים למעלה כשמגיעים אליהם, ותג השותף
import PartnerChip from "./PartnerChip";
import { useCountUp } from "./useCountUp";
import { useInView } from "./useInView";

function Stat({ target, suffix, label, run }: { target: number; suffix: string; label: string; run: boolean }) {
  const v = useCountUp(target, run, 1400);
  return (
    <div className="text-center">
      <div dir="ltr" className="text-[1.7rem] font-semibold tabular-nums text-brand-gold sm:text-6xl">{Math.round(v).toLocaleString("he-IL")}{suffix}</div>
      <div className="mt-1.5 text-xs leading-snug text-[#a39c8d] sm:mt-2 sm:text-base">{label}</div>
    </div>
  );
}

export default function ProofStrip() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    <section className="border-y border-[#1d1a14] bg-black">
      <div ref={ref} className="mx-auto grid w-full max-w-6xl grid-cols-3 items-start gap-x-3 gap-y-8 px-5 py-10 sm:items-center sm:gap-10 sm:py-14 lg:grid-cols-[1fr_1fr_1fr_auto] lg:px-8">
        <Stat target={10} suffix="" label="שנים של פרסום בגוגל" run={inView} />
        <Stat target={350} suffix="+" label="עסקים שהסוכנות ליוותה" run={inView} />
        <Stat target={8} suffix="M ₪" label="תקציבי פרסום שמנוהלים בשנה" run={inView} />
        <div className="col-span-3 flex justify-center lg:col-span-1"><PartnerChip /></div>
      </div>
    </section>
  );
}
