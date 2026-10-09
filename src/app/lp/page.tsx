"use client";

// דף הנחיתה של המשפך שלנו: תשעה חלקים, כל אחד ברכיב משלו ב-components/lp.
// המבנה המלא: docs/funnel-landing-page-blueprint.md. יעד יחיד: מעבר לצ'אט.
import { useEffect, useRef, useState } from "react";
import FaqSection from "@/components/lp/FaqSection";
import GoogleG from "@/components/lp/GoogleG";
import HowItWorks from "@/components/lp/HowItWorks";
import PartnerChip from "@/components/lp/PartnerChip";
import ProblemSection from "@/components/lp/ProblemSection";
import ProofStrip from "@/components/lp/ProofStrip";
import QueryWall from "@/components/lp/QueryWall";
import ReportPreview from "@/components/lp/ReportPreview";
import ReturnCalculator from "@/components/lp/ReturnCalculator";
import SearchStage from "@/components/lp/SearchStage";
import TestimonialsSection from "@/components/lp/TestimonialsSection";
import { loadTracking, trackFunnel } from "@/lib/prospect/track";

export default function LandingPage() {
  // הכפתור הצמוד בנייד מופיע רק אחרי הבמה, ונעלם כשמגיעים לקריאה האחרונה (שם יש כבר שורת חיפוש)
  const [sticky, setSticky] = useState(false);
  const finalRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const finalTop = finalRef.current?.getBoundingClientRect().top ?? Infinity;
      setSticky(window.scrollY > window.innerHeight * 0.75 && finalTop > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { loadTracking(); }, []);

  // מעבר לצ'אט: מקור ההגעה (מודעה, מילת חיפוש) עובר איתו, וגם התחום שהגולש הקליד
  const goToChat = (field: string) => {
    const params = new URLSearchParams(window.location.search);
    if (field) params.set("field", field); else params.delete("field");
    const qs = params.toString();
    // עוברים לצ'אט רק אחרי שהדיווח על הלחיצה יצא, כדי שהמעבר לא יקטע אותו
    trackFunnel(["funnel_lp_click"], () => { window.location.href = `/start${qs ? `?${qs}` : ""}`; });
  };

  return (
    <div dir="rtl" className="min-h-dvh overflow-x-hidden bg-[#0a0908] font-ploni text-[#f4f0e7]">
      {/* הבמה: קיר החיפושים ברקע, ושורת החיפוש במרכז */}
      <section className="relative flex min-h-dvh flex-col">
        <QueryWall />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_58%,rgba(238,216,155,0.10),transparent_55%)]" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-9" />
          <span className="hidden items-center gap-2 text-sm text-[#a39c8d] sm:inline-flex">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white"><GoogleG className="h-3.5 w-3.5" /></span>
            נתוני חיפוש אמיתיים מ-Google
          </span>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 pb-16 pt-6 text-center lg:px-8">
          <h1 className="max-w-5xl text-balance text-[2.1rem] font-semibold leading-[1.12] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            לפני שמשקיעים שקל בפרסום בגוגל,
            <span className="block text-brand-gold">בדקו כמה זה אמור להחזיר בתחום שלכם.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#c9c2b3]">
            בכל רגע מישהו מקליד בגוגל את מה שאתם מוכרים. הקלידו את התחום שלכם וקבלו את המספרים שלו.
          </p>
          <div className="mt-10 w-full">
            <SearchStage onSubmit={goToChat} />
          </div>
          <p className="mt-2 text-sm text-[#7e776a]">שתי דקות · בלי עלות · בלי התחייבות</p>
        </div>
      </section>

      <ProofStrip />
      <ProblemSection />

      {/* מפריד: החייט מותח את סרט המדידה */}
      <div className="relative mx-auto w-full max-w-md px-8 sm:max-w-xl">
        <div aria-hidden className="absolute inset-x-0 inset-y-4 rounded-full bg-[radial-gradient(ellipse,rgba(238,216,155,0.26),transparent_68%)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/tailor-tape.webp" alt="החייט מותח סרט מדידה" loading="lazy" className="relative w-full" />
      </div>

      {/* החלק השני: מה זה אומר בכסף. הדמות מסבירה שזו הדמיה, כדי שאף אחד לא יחשוב שאלה המספרים שלו */}
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-16 lg:px-8 lg:py-28">
        <div>
          <p className="text-sm font-medium text-brand-gold">ומה זה אומר בכסף?</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight sm:text-5xl">חיפושים הם רק ההתחלה. השאלה היא כמה מהם הופכים לעסקאות.</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#c9c2b3]">
            שחקו עם ההדמיה: החליפו תחום, הזיזו תקציב, וראו איך התמונה משתנה. יש תחומים שבהם כל שקל מחזיר פי עשרה, ויש כאלה שבהם הוא לא מחזיר את עצמו.
          </p>

          <div className="mt-8 flex items-end gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/tailor-character.png" alt="" className="h-28 w-28 shrink-0 sm:h-36 sm:w-36" />
            <div className="relative mb-4 rounded-2xl rounded-br-sm border border-brand-gold/40 bg-[#14120e] px-5 py-4">
              <p className="text-lg font-semibold text-[#f4f0e7]">שימו לב, זו רק הדמיה.</p>
              <p className="mt-1 leading-relaxed text-[#c9c2b3]">המספרים של התחום שלכם יהיו אחרים. אותם מקבלים בצ&apos;אט, תוך שתי דקות.</p>
            </div>
          </div>

          <button onClick={() => goToChat("")}
            className="mt-6 hidden items-center justify-center rounded-lg bg-brand-gold px-8 py-4 text-lg font-semibold text-black transition-all duration-200 hover:brightness-95 sm:inline-flex">
            לקבל את המספרים של התחום שלי
          </button>
        </div>
        <div className="mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
          <ReturnCalculator />
        </div>
      </section>
      <HowItWorks />
      <ReportPreview onCta={() => goToChat("")} />
      <TestimonialsSection />
      <FaqSection />

      {/* קריאה אחרונה: שורת החיפוש חוזרת, והפעם ריקה ומחכה לגולש */}
      <section ref={finalRef} className="relative overflow-hidden bg-black">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_70%,rgba(238,216,155,0.14),transparent_60%)]" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-5 py-14 text-center lg:px-8 lg:py-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/tailor-handshake.webp" alt="החייט מושיט יד ללחיצה" loading="lazy" className="w-44 sm:w-56" />
          <h2 className="mt-6 max-w-3xl text-balance text-3xl font-semibold leading-tight sm:text-5xl">עכשיו תורכם. מה התחום שלכם?</h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-[#c9c2b3]">שתי דקות, ותדעו כמה הפרסום בגוגל אמור להחזיר לכם. לפני שהשקעתם שקל.</p>
          <div className="mt-9 w-full"><SearchStage onSubmit={goToChat} demo={false} /></div>
        </div>
      </section>

      <footer className="border-t border-[#1d1a14] bg-black">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-[#7e776a] sm:flex-row lg:px-8">
          <span>מר דיגיטיילור בע&quot;מ · ספיר יוסף 1, חולון</span>
          <PartnerChip />
          <a href="/privacy" className="underline transition-colors duration-200 hover:text-brand-gold">מדיניות פרטיות</a>
        </div>
      </footer>

      {/* כפתור צמוד לתחתית בנייד */}
      <div className={`fixed inset-x-0 bottom-0 z-20 border-t border-[#272319] bg-[#0a0908]/95 p-3 backdrop-blur transition-transform duration-200 sm:hidden ${sticky ? "translate-y-0" : "translate-y-full"}`}>
        <button onClick={() => goToChat("")} className="flex w-full items-center justify-center rounded-lg bg-brand-gold py-3.5 text-base font-semibold text-black">לבדוק את התחום שלי</button>
      </div>
    </div>
  );
}
