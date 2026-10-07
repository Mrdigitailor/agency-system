"use client";

// דף הנחיתה של המשפך שלנו. כרגע: החלק העליון בלבד (דוגמת עיצוב לאישור).
// המבנה המלא: docs/funnel-landing-page-blueprint.md. יעד יחיד: מעבר לצ'אט.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const GTM_ID = "GTM-5BP74DF5";

// סרט המדידה: המוטיב של הדף. חייט מודד לפני שהוא גוזר, ואנחנו מודדים את השוק לפני שמפרסמים.
function MeasuringTape({ className = "" }: { className?: string }) {
  const ticks = Array.from({ length: 241 }, (_, i) => i);
  return (
    <svg viewBox="0 0 2400 64" preserveAspectRatio="xMinYMid slice" aria-hidden className={className}>
      <rect width="2400" height="64" fill="#eed89b" />
      <rect width="2400" height="3" fill="#d9bf74" />
      <rect y="61" width="2400" height="3" fill="#d9bf74" />
      {ticks.map((i) => {
        const major = i % 10 === 0, mid = i % 5 === 0;
        return <rect key={i} x={i * 10} y={0} width={major ? 2 : 1} height={major ? 30 : mid ? 20 : 12} fill="#0a0908" />;
      })}
      {ticks.filter((i) => i % 10 === 0 && i > 0).map((i) => (
        <text key={i} x={i * 10 + 6} y={50} fontSize="17" fontWeight="600" fill="#0a0908" fontFamily="Ploni, sans-serif">{i / 10}</text>
      ))}
    </svg>
  );
}

// כרטיס המידות: מה שהגולש מקבל בסוף השיחה, בדוגמה להמחשה
const SLIP_ROWS: Array<[string, string]> = [
  ["חיפושים בחודש בגוגל", "24,540"],
  ["מחיר ממוצע לקליק", "13.7 ₪"],
  ["תקציב לבדיקה", "6,000 ₪"],
  ["פניות צפויות בחודש", "כ-22"],
];

export default function LandingPage() {
  const [chatHref, setChatHref] = useState("/start");

  useEffect(() => {
    // מקור ההגעה (מודעה, מילת חיפוש) עובר לצ'אט, כדי שנדע איזו מילה הביאה כל ליד
    setChatHref(`/start${window.location.search}`);
    if (document.getElementById("gtm-loader")) return;
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const s = document.createElement("script");
    s.id = "gtm-loader"; s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    document.head.appendChild(s);
  }, []);

  const trackClick = () => {
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> };
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event: "funnel_lp_click" });
  };

  const cta = (extra = "") => (
    <a href={chatHref} onClick={trackClick}
      className={`group items-center justify-center gap-3 rounded-lg bg-brand-gold px-8 py-4 text-lg font-semibold text-black transition-all duration-200 hover:brightness-95 ${extra}`}>
      למדוד את העסק שלי
      <ArrowLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-1" />
    </a>
  );

  return (
    <div dir="rtl" className="min-h-dvh overflow-x-hidden bg-[#0a0908] font-ploni text-[#f4f0e7]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-9" />
        <span className="hidden text-sm text-[#7e776a] sm:block">פרסום בגוגל, תפור למידה</span>
      </header>

      <main className="relative">
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-24 lg:pt-14">
          <div>
            <p className="text-sm font-medium tracking-wide text-brand-gold">לבעלי עסקים ששוקלים לפרסם בגוגל</p>
            <h1 className="mt-4 text-[2.35rem] font-semibold leading-[1.08] sm:text-6xl lg:text-7xl">
              קודם מודדים.
              <span className="block text-brand-gold">אחר כך מפרסמים.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#c9c2b3] lg:text-xl">
              חייט טוב לא גוזר בד לפני שלקח מידות. תוך שתי דקות תקבל את המידות של העסק שלך בגוגל: כמה אנשים מחפשים אותך, כמה עולה להגיע אליהם, וכמה זה אמור להחזיר.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3">
              {cta("hidden sm:inline-flex")}
              <p className="text-sm text-[#7e776a]">שתי דקות בצ&apos;אט · בלי עלות · בלי התחייבות</p>
            </div>
          </div>

          {/* כרטיס המידות: תפר זהב מסביב, כמו פתק של חייט */}
          <div className="relative mx-auto w-full max-w-sm lg:mx-0 lg:justify-self-end">
            <div className="rotate-1 rounded-lg bg-[#14120e] p-2 shadow-2xl">
              <div className="rounded-md border border-dashed border-brand-gold/60 px-6 py-6">
                <div className="flex items-baseline justify-between border-b border-[#272319] pb-3">
                  <h2 className="text-lg font-semibold text-[#f4f0e7]">כרטיס מידות</h2>
                  <span className="text-xs text-[#7e776a]">דוגמה: ייעוץ משכנתאות</span>
                </div>
                <dl>
                  {SLIP_ROWS.map(([label, value], i) => (
                    <div key={label} className={`flex items-baseline justify-between gap-4 py-3.5 ${i < SLIP_ROWS.length - 1 ? "border-b border-[#272319]" : ""}`}>
                      <dt className="text-sm text-[#a39c8d]">{label}</dt>
                      <dd className={`font-semibold tabular-nums ${i === SLIP_ROWS.length - 1 ? "text-2xl text-brand-gold" : "text-xl text-[#f4f0e7]"}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs leading-relaxed text-[#7e776a]">המספרים להמחשה. את המידות של העסק שלך מקבלים בצ&apos;אט, מנתוני החיפוש של גוגל.</p>
              </div>
            </div>
          </div>
        </section>

        {/* סרט המדידה חוצה את הדף */}
        <div className="pointer-events-none -mx-6 -rotate-1 overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          <MeasuringTape className="h-12 w-full lg:h-14" />
        </div>
        <div className="h-28" />
      </main>

      {/* כפתור צמוד לתחתית בנייד */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#272319] bg-[#0a0908]/95 p-3 backdrop-blur sm:hidden">
        {cta("flex w-full py-3.5 text-base")}
      </div>
    </div>
  );
}
