"use client";

// איך זה עובד: שלושה שלבים לאורך סרט מדידה שמתמלא בזהב תוך כדי גלילה
import { useEffect, useRef, useState } from "react";

const STEPS = [
  { time: "2 דקות", img: "/images/tailor-typing.webp", alt: "החייט מקליד את התחום בשורת החיפוש", title: "מקלידים את התחום בצ'אט", body: "העוזר הדיגיטלי שואל כמה שאלות קצרות: מה אתם מוכרים, איפה, וכמה שווה לכם עסקה." },
  { time: "15 שניות", img: "/images/tailor-magnifier.webp", alt: "החייט בוחן את תוצאות החיפוש בזכוכית מגדלת", title: "המערכת ניגשת לגוגל", body: "בזמן אמת היא שולפת כמה אנשים מחפשים את התחום שלכם בחודש, וכמה עולה קליק על כל ביטוי." },
  { time: "מיד", img: "/images/tailor-report.webp", alt: "החייט מציג את הדוח עם המספרים", title: "מקבלים דוח עם המספרים", body: "הביקוש, המחירים, וכמה פניות ועסקאות התקציב שלכם אמור להביא. כל שלב בחישוב גלוי." },
  { time: "30 דקות, אם רוצים", img: "", alt: "", title: "עוברים על הדוח בפגישת זום", body: "בלי עלות ובלי התחייבות. אפשר גם לקחת את הדוח ולהמשיך לבד." },
];

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setProgress(Math.max(0, Math.min(1, (window.innerHeight * 0.7 - r.top) / r.height)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="bg-black">
      <div className="mx-auto w-full max-w-5xl px-5 py-14 lg:px-8 lg:py-28">
        <p className="text-center text-sm font-medium text-brand-gold">איך זה עובד</p>
        <h2 className="mt-3 text-balance text-center text-3xl font-semibold leading-tight sm:text-5xl">מהקלדה ראשונה ועד דוח ביד: פחות משלוש דקות.</h2>

        <div ref={ref} className="relative mt-14 pr-14 sm:pr-20">
          {/* הסרט: רקע כהה, והחלק שכבר עברתם מתמלא בזהב */}
          <svg aria-hidden viewBox="0 0 10 100" preserveAspectRatio="none" className="absolute right-3 top-0 h-full w-5 overflow-hidden rounded-full sm:right-6 sm:w-6">
            <rect width="10" height="100" fill="#1d1a14" />
            <rect width="10" height={progress * 100} fill="#eed89b" />
            {Array.from({ length: 40 }, (_, i) => <rect key={i} x={i % 5 === 0 ? 0 : 5} y={i * 2.5} width={i % 5 === 0 ? 10 : 5} height="0.25" fill="#0a0908" />)}
          </svg>

          <ol className="space-y-14 sm:space-y-16">
            {STEPS.map((s, i) => {
              const reached = progress >= (i + 0.35) / STEPS.length;
              return (
                <li key={s.title} className={`grid items-center gap-6 transition-opacity duration-500 sm:grid-cols-[1fr_18rem] sm:gap-10 lg:grid-cols-[1fr_22rem] ${reached ? "opacity-100" : "opacity-35"}`}>
                  <div>
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-500 ${reached ? "bg-brand-gold text-black" : "bg-[#1d1a14] text-[#7e776a]"}`}>{s.time}</span>
                  <h3 className="mt-3 text-2xl font-semibold text-[#f4f0e7] sm:text-3xl">{s.title}</h3>
                  <p className="mt-2 max-w-2xl text-lg leading-relaxed text-[#c9c2b3]">{s.body}</p>
                  </div>
                  {/* הדמות עומדת חופשי על הרקע הכהה. הזוהר הזהוב מאחור שומר על קו המתאר של הבגד השחור */}
                  {s.img && (
                    <div className="relative mx-auto w-full max-w-[15rem] sm:max-w-none">
                      <div aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(238,216,155,0.30),transparent_68%)]" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.img} alt={s.alt} loading="lazy" className="relative w-full" />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
