"use client";

// הבעיה: שלושה משפטים שבעלי עסקים אומרים על פרסום בגוגל. לוחצים על משפט, והחייט עונה.
import { useState } from "react";

const DOUBTS = [
  { say: "כבר ניסיתי גוגל. שרפתי כסף ולא יצא מזה כלום.", answer: "ברוב המקרים הכסף הלך על חיפושים שלא קשורים למה שמוכרים, או על תחום שמחיר הקליק בו גבוה מדי לתקציב. את שני הדברים רואים במספרים לפני שמתחילים." },
  { say: "אין לי מושג כמה תקציב צריך בשביל שזה יעבוד.", answer: "זה תלוי במחיר הקליק בתחום שלך. בתחום אחד קליק עולה 3 ₪, ובאחר 45 ₪. בלי המספר הזה כל תקציב הוא ניחוש." },
  { say: "כל סוכנות מבטיחה לי תוצאות. למה שאאמין?", answer: "אל תאמין להבטחות, גם לא לשלנו. הנתונים של גוגל פתוחים: כמה מחפשים, כמה זה עולה. קודם רואים אותם, ורק אחר כך מחליטים." },
];

export default function ProblemSection() {
  const [open, setOpen] = useState(0);
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16 lg:px-8 lg:py-28">
      <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
        <div aria-hidden className="absolute inset-6 rounded-full bg-[radial-gradient(circle,rgba(238,216,155,0.22),transparent_68%)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/tailor-measuring.png" alt="החייט של Mr.digitailor מודד לקוח בסרט מדידה" className="relative w-full" />
      </div>

      <div>
        <p className="text-sm font-medium text-brand-gold">חייט טוב מודד לפני שהוא גוזר</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight sm:text-5xl">רוב העסקים מתחילים לפרסם בלי לקחת מידות.</h2>
        <p className="mt-5 text-lg leading-relaxed text-[#c9c2b3]">אולי אחד מהמשפטים האלה מוכר לכם. לחצו עליו.</p>

        <div className="mt-7 space-y-3">
          {DOUBTS.map((d, i) => (
            <div key={d.say} className={`overflow-hidden rounded-xl border transition-colors duration-200 ${open === i ? "border-brand-gold/60 bg-[#14120e]" : "border-[#272319] bg-[#0f0d0a]"}`}>
              <button onClick={() => setOpen(i)} aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-right text-lg font-medium text-[#f4f0e7]">
                <span>&quot;{d.say}&quot;</span>
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-200 ${open === i ? "bg-brand-gold" : "bg-[#3a3324]"}`} />
              </button>
              {open === i && (
                <div className="flex items-start gap-3 border-t border-[#272319] px-5 py-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/tailor-character.png" alt="" className="h-12 w-12 shrink-0" />
                  <p className="leading-relaxed text-[#c9c2b3]">{d.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
