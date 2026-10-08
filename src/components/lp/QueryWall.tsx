"use client";

// קיר החיפושים: ביטויים אמיתיים שאנשים מקלידים בגוגל, זורמים ברקע בשורות לכיוונים מנוגדים
import { useEffect, useRef } from "react";

const ROWS: string[][] = [
  ["עורך דין לענייני משפחה", "וילונות לסלון", "שיפוץ חדר אמבטיה", "מחשבון משכנתא", "ציפוי שיניים מחיר", "עורך דין מקרקעין", "טפטים לקירות"],
  ["פאנלים סולאריים מחיר", "עורך דין גירושין", "וילון האפלה", "שיפוץ מקלחת", "קידום ממומן בגוגל", "טפט לארונות מטבח", "עורך דין נדלן"],
  ["וילונות לחדר שינה", "עלות הלבנת שיניים", "התקנת פאנלים סולאריים", "משכנתא", "עורך דין מכירת דירה", "וילון זברה", "ניהול קמפיינים"],
  ["שיפוץ חדר אמבטיה קומפלט מחיר", "טפטים לילדות", "עורך דין משפחה", "פרסום ממומן", "מסילה לוילון", "פאנלים סולאריים לבית", "ציפוי חרסינה לשיניים מחיר"],
  ["עורך דין לגירושים", "מוטות לוילונות", "שיפוץ אמבטיה", "משכנתאות", "טפט לארון", "קידום ממומן", "עורך דין מכר דירה"],
];
const SIZES = ["text-3xl lg:text-5xl", "text-2xl lg:text-4xl", "text-4xl lg:text-6xl", "text-2xl lg:text-4xl", "text-3xl lg:text-5xl"];

export default function QueryWall() {
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anims = refs.current.map((el, i) => el?.animate(
      i % 2 === 0 ? [{ transform: "translateX(0)" }, { transform: "translateX(-50%)" }] : [{ transform: "translateX(-50%)" }, { transform: "translateX(0)" }],
      { duration: 70_000 + i * 9_000, iterations: Infinity, easing: "linear" },
    ));
    return () => anims.forEach((a) => a?.cancel());
  }, []);

  return (
    <div aria-hidden dir="ltr" className="pointer-events-none absolute inset-0 flex select-none flex-col justify-center gap-5 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_85%)] lg:gap-7">
      {ROWS.map((row, i) => (
        <div key={i} ref={(el) => { refs.current[i] = el; }} className="flex w-max gap-10 whitespace-nowrap will-change-transform">
          {[...row, ...row].map((q, j) => (
            <span key={j} dir="rtl" className={`font-semibold text-brand-gold/[0.11] ${SIZES[i]}`}>{q}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
