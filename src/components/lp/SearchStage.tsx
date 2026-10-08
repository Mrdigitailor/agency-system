"use client";

// הבמה של הדף: שורת חיפוש שמקלידה לבד ביטויים אמיתיים ומציגה את הנתונים שלהם,
// ואז מזמינה את הגולש להקליד את התחום שלו. ההקלדה שלו היא הצעד הראשון של השיחה בצ'אט.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import GoogleG from "./GoogleG";

// נתוני חיפוש אמיתיים (ממוצע חודשי בישראל, מחיר ממוצע לקליק) מתוך מחקרי מילות החיפוש שלנו
const EXAMPLES = [
  { q: "עורך דין לענייני משפחה", vol: 2900, cpc: 45.8 },
  { q: "וילונות לסלון", vol: 4400, cpc: 3.8 },
  { q: "שיפוץ חדר אמבטיה", vol: 880, cpc: 6.4 },
  { q: "עורך דין מקרקעין", vol: 1600, cpc: 23.4 },
  { q: "ציפוי שיניים מחיר", vol: 590, cpc: 6.1 },
  { q: "טפטים לקירות", vol: 4400, cpc: 2.1 },
];
const BUDGET = 5000;
type Phase = "typing" | "searching" | "results" | "erasing";

/** מספר שרץ מ-0 עד היעד בכל פעם שהיעד מתחלף */
function useCountUp(target: number, run: boolean, ms = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / ms, 1);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return run ? value : 0;
}

export default function SearchStage({ onSubmit }: { onSubmit: (field: string) => void }) {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");
  const [userMode, setUserMode] = useState(false);
  const [userText, setUserText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ex = EXAMPLES[index];

  // מכונת המצבים של ההדגמה: מקליד, מחפש, מציג, מוחק, עובר לביטוי הבא
  useEffect(() => {
    if (userMode) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      t = typed.length < ex.q.length
        ? setTimeout(() => setTyped(ex.q.slice(0, typed.length + 1)), 70)
        : setTimeout(() => setPhase("searching"), 350);
    } else if (phase === "searching") {
      t = setTimeout(() => setPhase("results"), 700);
    } else if (phase === "results") {
      t = setTimeout(() => setPhase("erasing"), 3600);
    } else {
      t = typed.length > 0
        ? setTimeout(() => setTyped(typed.slice(0, -1)), 22)
        : setTimeout(() => { setIndex((i) => (i + 1) % EXAMPLES.length); setPhase("typing"); }, 250);
    }
    return () => clearTimeout(t);
  }, [typed, phase, userMode, ex.q]);

  const showing = !userMode && phase === "results";
  const vol = useCountUp(ex.vol, showing);
  const cpc = useCountUp(ex.cpc, showing);
  const clicks = useCountUp(BUDGET / ex.cpc, showing);

  const takeOver = () => { if (!userMode) { setUserMode(true); setTimeout(() => inputRef.current?.focus(), 0); } };
  const submit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(userText.trim()); };

  const stats: Array<[string, string]> = [
    [Math.round(vol).toLocaleString("he-IL"), "חיפושים בחודש"],
    [`${cpc.toFixed(1)} ₪`, "מחיר ממוצע לקליק"],
    [Math.round(clicks).toLocaleString("he-IL"), `קליקים ב-${BUDGET.toLocaleString("he-IL")} ₪`],
  ];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form onSubmit={submit} onClick={takeOver}
        className={`flex h-16 cursor-text items-center gap-3 rounded-full bg-white pl-2 pr-5 transition-shadow duration-200 sm:h-[4.5rem] sm:pr-7 ${userMode ? "shadow-[0_0_0_4px_rgba(238,216,155,0.55),0_30px_80px_-10px_rgba(238,216,155,0.45)]" : "shadow-[0_0_0_1px_rgba(238,216,155,0.35),0_30px_90px_-10px_rgba(238,216,155,0.35)]"}`}>
        <GoogleG className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
        {userMode ? (
          <input ref={inputRef} value={userText} onChange={(e) => setUserText(e.target.value.slice(0, 80))}
            placeholder="הקלידו את התחום שלכם, למשל: רופא שיניים בחיפה" aria-label="התחום שלכם"
            className="h-full min-w-0 flex-1 bg-transparent text-lg text-black outline-none placeholder:text-[#9a958c] sm:text-2xl" />
        ) : (
          <div className="flex min-w-0 flex-1 items-center text-lg text-black sm:text-2xl">
            <span className="truncate">{typed}</span>
            <span className="mr-0.5 inline-block h-6 w-0.5 animate-pulse bg-black sm:h-7" />
          </div>
        )}
        <button type="submit" aria-label="לבדוק את התחום שלי"
          className="group flex h-12 shrink-0 items-center gap-2 rounded-full bg-black px-4 text-sm font-semibold text-brand-gold transition-all duration-200 hover:bg-[#1d1a14] sm:h-14 sm:px-6 sm:text-base">
          <span className="hidden sm:inline">לבדוק את התחום שלי</span>
          <span className="sm:hidden">בדקו</span>
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
        </button>
      </form>

      <div className="mt-8 min-h-[8.5rem] sm:min-h-[9.5rem]">
        {userMode ? (
          <p className="text-center text-lg leading-relaxed text-[#c9c2b3]">
            כתבו מה אתם מוכרים ואיפה, ולחצו Enter.
            <span className="block text-[#7e776a]">הצ&apos;אט ייפתח עם התחום שלכם, ותוך שתי דקות תקבלו את המספרים שלו.</span>
          </p>
        ) : (
          <>
            <div className={`grid grid-cols-3 divide-x divide-x-reverse divide-[#272319] transition-opacity duration-300 ${showing ? "opacity-100" : "opacity-0"}`}>
              {stats.map(([value, label]) => (
                <div key={label} className="px-2 text-center">
                  <div className="text-3xl font-semibold tabular-nums text-brand-gold sm:text-5xl">{value}</div>
                  <div className="mt-1.5 text-xs text-[#a39c8d] sm:text-sm">{label}</div>
                </div>
              ))}
            </div>
            <div className={`mt-5 flex items-center justify-center gap-1.5 transition-opacity duration-200 ${phase === "searching" ? "opacity-100" : "opacity-0"}`} aria-hidden>
              {["bg-[#4285F4]", "bg-[#EA4335]", "bg-[#FBBC05]", "bg-[#34A853]"].map((c) => <span key={c} className={`h-2 w-2 animate-bounce rounded-full ${c}`} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
