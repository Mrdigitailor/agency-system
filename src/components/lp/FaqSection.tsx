"use client";

// שאלות נפוצות: מה שעוצר את הגולש מללחוץ. נפתחות בלחיצה, אחת בכל פעם.
import { useState } from "react";
import { Plus } from "lucide-react";

const FAQ: Array<[string, string]> = [
  ["כמה זה עולה?", "הבדיקה והדוח בלי עלות. על המחיר של עבודה איתנו מדברים רק בפגישה, אחרי שרואים אם הפרסום בכלל משתלם בתחום שלכם."],
  ["זו שיחת מכירה מוסווית?", "הצ'אט הוא עוזר דיגיטלי שבודק את נתוני גוגל ומכין לכם דוח. בסוף הוא מציע פגישת זום של 30 דקות. אפשר לקחת את הדוח ולא לקבוע כלום."],
  ["מאיפה המספרים?", "מנתוני החיפוש של גוגל: כמה פעמים בחודש מחפשים כל ביטוי בישראל, וכמה מפרסמים משלמים על קליק. אלה נתונים שגוגל מספקת למפרסמים, לא הערכות שלנו."],
  ["התחום שלי קטן או מקומי. זה רלוונטי?", "הבדיקה נעשית לפי התחום והאזור שלכם. אם אין מספיק חיפושים כדי שפרסום בגוגל ישתלם, הדוח יראה את זה, וזה שווה לא פחות."],
  ["כמה זמן זה לוקח?", "בערך שתי דקות בצ'אט. המחקר מול גוגל רץ תוך כדי השיחה ולוקח כ-15 שניות."],
  ["מה עושים עם הפרטים שלי?", "משתמשים בהם כדי לשלוח את הדוח, לתאם פגישה אם תרצו, ולשלוח כמה מיילים עם תובנות. אפשר להסיר את עצמכם בלחיצה. הפירוט המלא במדיניות הפרטיות שבתחתית הדף."],
];

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-14 lg:px-8 lg:py-28">
      <p className="text-center text-sm font-medium text-brand-gold">שאלות נפוצות</p>
      <h2 className="mt-3 text-balance text-center text-3xl font-semibold leading-tight sm:text-5xl">מה ששואלים לפני שלוחצים.</h2>
      <div className="mt-10 divide-y divide-[#272319] border-y border-[#272319]">
        {FAQ.map(([q, a], i) => (
          <div key={q}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
              className="flex w-full items-center justify-between gap-4 py-5 text-right text-xl font-medium text-[#f4f0e7] transition-colors duration-200 hover:text-brand-gold">
              {q}
              <Plus className={`h-5 w-5 shrink-0 text-brand-gold transition-transform duration-200 ${open === i ? "rotate-45" : ""}`} />
            </button>
            {open === i && <p className="pb-6 text-lg leading-relaxed text-[#c9c2b3]">{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
