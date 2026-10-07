"use client";

// דף הנחיתה של המשפך שלנו. כרגע: החלק העליון בלבד (דוגמת עיצוב לאישור).
// המבנה המלא: docs/funnel-landing-page-blueprint.md. יעד יחיד: מעבר לצ'אט.
import { useEffect, useState } from "react";
import { ArrowLeft, MousePointerClick, MessageSquare, Handshake } from "lucide-react";

const GTM_ID = "GTM-5BP74DF5";

// הנחות הדוגמה במחשבון: אותן הנחות שמרניות שהדוח האמיתי משתמש בהן (verdict.ts)
const EXAMPLE = { field: "ייעוץ משכנתאות", cpc: 12.5, pageConv: 0.05, closeRate: 0.05, deal: 12000 };
const nis = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-label="Google" role="img" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// סרט המדידה של החייט: סימן המותג שמפריד בין חלקי הדף
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

// מחשבון ההחזר: מזיזים את התקציב ורואים את כל הדרך, מהקליק ועד ההכנסה
function ReturnCalculator() {
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
      לבדוק את התחום שלי
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
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-4 lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-24 lg:pt-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#272319] bg-[#12100c] py-1.5 pl-4 pr-1.5 text-sm text-[#c9c2b3]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white"><GoogleG className="h-3.5 w-3.5" /></span>
              לפי נתוני החיפוש של Google
            </div>
            <h1 className="mt-5 text-[2.1rem] font-semibold leading-[1.12] sm:text-5xl lg:text-[3.1rem] lg:leading-[1.12]">
              לפני שמשקיעים שקל בפרסום בגוגל,
              <span className="block text-brand-gold">בדקו כמה זה אמור להחזיר בתחום שלכם.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#c9c2b3]">
              שתי דקות בצ&apos;אט, ותקבלו דוח עם המספרים של התחום שלכם: כמה אנשים מחפשים אתכם בגוגל, כמה עולה קליק, וכמה פניות ועסקאות התקציב שלכם אמור להביא.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3">
              {cta("hidden sm:inline-flex")}
              <p className="text-sm text-[#7e776a]">שתי דקות · בלי עלות · בלי התחייבות</p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
            <ReturnCalculator />
          </div>
        </section>

        <div className="pointer-events-none -mx-6 -rotate-1 overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          <MeasuringTape className="h-10 w-full lg:h-12" />
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
