import type { Metadata } from "next";
import { PRIVACY_VERSION, privacyProfile, privacySections } from "@/lib/prospect/privacy";

export const metadata: Metadata = { title: "מדיניות פרטיות" };

// עמוד ציבורי: מדיניות הפרטיות של המשפך. ?p=<slug> בוחר את העסק (כמו בדף הצ'אט).
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const profile = privacyProfile(p);
  const sections = privacySections(profile);
  const [y, m, d] = PRIVACY_VERSION.split("-");

  return (
    <div dir="rtl" className="min-h-screen bg-brand-bg px-4 py-10 font-ploni">
      <article className="mx-auto w-full max-w-2xl rounded-lg border border-brand-border bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-2xl font-semibold text-brand-dark">מדיניות פרטיות</h1>
        <p className="mt-1 text-sm text-brand-muted">{profile.brandName} · עודכן לאחרונה: {d}/{m}/{y}</p>

        {sections.map((s) => (
          <section key={s.title} className="mt-8">
            <h2 className="text-lg font-semibold text-brand-dark">{s.title}</h2>
            {s.paragraphs?.map((t, i) => <p key={i} className="mt-2 leading-relaxed text-brand-dark">{t}</p>)}
            {s.bullets && (
              <ul className="mt-2 list-disc space-y-1.5 pr-5 leading-relaxed text-brand-dark">
                {s.bullets.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
            {s.after?.map((t, i) => <p key={i} className="mt-2 leading-relaxed text-brand-dark">{t}</p>)}
          </section>
        ))}

        <p className="mt-10 border-t border-brand-border pt-5 text-sm text-brand-muted">
          שאלות? <a href={`mailto:${profile.contactEmail}`} className="underline transition-colors duration-200 hover:text-brand-dark">{profile.contactEmail}</a>
        </p>
      </article>
    </div>
  );
}
