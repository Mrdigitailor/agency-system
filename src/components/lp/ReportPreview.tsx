"use client";

// מה מקבלים: הצצה לדוח, עם נתונים אמיתיים מדוח בתחום הווילונות. שלוש לשוניות, כמו בדוח עצמו.
import { useState } from "react";

const TERMS: Array<[string, number, number]> = [
  ["וילונות לסלון", 4400, 3.8],
  ["וילונות לחדר שינה", 2400, 3.2],
  ["מסילה לוילון", 1300, 4.0],
  ["מוטות לוילונות", 1300, 1.5],
];
const TOTAL = 31230, BUDGET = 5000, AVG_CPC = 3.4;
const TABS = ["הביקוש", "המחירים", "החשבון"] as const;
const n = (x: number) => Math.round(x).toLocaleString("he-IL");

export default function ReportPreview({ onCta }: { onCta: () => void }) {
  const [tab, setTab] = useState<typeof TABS[number]>("הביקוש");
  const clicks = BUDGET / AVG_CPC, leads = clicks * 0.05;
  const maxVol = TERMS[0][1];

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16 lg:px-8 lg:py-28">
      <div>
        <p className="text-sm font-medium text-brand-gold">מה מקבלים בסוף השיחה</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight sm:text-5xl">דוח אישי על התחום שלכם, לא מצגת מכירה.</h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#c9c2b3]">
          זה חלק מדוח אמיתי שהמערכת הפיקה לעסק בתחום הווילונות. הדוח שלכם ייראה אותו דבר, עם המספרים של התחום והאזור שלכם, והוא נשאר אצלכם גם אם לא נדבר יותר.
        </p>
        <button onClick={onCta} className="mt-8 hidden items-center justify-center rounded-lg bg-brand-gold px-8 py-4 text-lg font-semibold text-black transition-all duration-200 hover:brightness-95 sm:inline-flex">
          להכין לי דוח כזה
        </button>
      </div>

      <div className="-rotate-1 rounded-2xl bg-[#f4f0e7] p-1.5 shadow-[0_30px_80px_-20px_rgba(238,216,155,0.35)]">
        <div className="rounded-xl bg-white p-5 text-black sm:p-6">
          <div className="flex items-baseline justify-between border-b border-[#e0e0e0] pb-3">
            <h3 className="text-lg font-semibold">דוח פוטנציאל: וילונות</h3>
            <span className="text-xs text-[#666666]">דוגמה מדוח אמיתי</span>
          </div>

          <div className="mt-4 flex gap-2">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${tab === t ? "bg-black text-brand-gold" : "bg-[#f5f5f5] text-[#666666] hover:text-black"}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="mt-5 min-h-[15rem]">
            {tab === "הביקוש" && (
              <>
                <div className="text-5xl font-semibold tabular-nums">{n(TOTAL)}</div>
                <div className="mt-1 text-sm text-[#666666]">חיפושים בחודש בגוגל, בכל הביטויים של התחום</div>
                <div className="mt-5 space-y-2.5">
                  {TERMS.map(([term, vol]) => (
                    <div key={term}>
                      <div className="flex justify-between text-sm"><span>{term}</span><span className="tabular-nums text-[#666666]">{n(vol)}</span></div>
                      <svg viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden className="mt-1 h-2 w-full overflow-hidden rounded-full">
                        <rect width="100" height="3" fill="#f5f5f5" />
                        <rect x={100 - (vol / maxVol) * 100} width={(vol / maxVol) * 100} height="3" fill="#000000" />
                      </svg>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "המחירים" && (
              <table className="w-full text-right text-sm">
                <thead><tr className="border-b border-[#e0e0e0] text-xs text-[#666666]"><th className="py-2 font-medium">ביטוי</th><th className="py-2 font-medium">חיפושים</th><th className="py-2 font-medium">מחיר לקליק</th></tr></thead>
                <tbody>
                  {TERMS.map(([term, vol, cpc]) => (
                    <tr key={term} className="border-b border-[#f5f5f5]"><td className="py-3">{term}</td><td className="py-3 tabular-nums">{n(vol)}</td><td className="py-3 font-semibold tabular-nums">{cpc.toFixed(1)} ₪</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "החשבון" && (
              <dl className="divide-y divide-[#f5f5f5]">
                {([
                  ["תקציב חודשי", `${n(BUDGET)} ₪`],
                  ["מחיר ממוצע לקליק", `${AVG_CPC} ₪`],
                  ["קליקים בחודש", n(clicks)],
                  ["פניות צפויות (5 מכל 100 מבקרים)", `כ-${n(leads)}`],
                ] as Array<[string, string]>).map(([k, v], i, arr) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="text-sm text-[#666666]">{k}</dt>
                    <dd className={`font-semibold tabular-nums ${i === arr.length - 1 ? "text-3xl" : "text-xl"}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
