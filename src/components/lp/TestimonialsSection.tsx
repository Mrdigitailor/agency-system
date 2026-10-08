// המלצות: הסיפור של נועה בגדול, ושאר ההמלצות סביבו
import { TESTIMONIALS } from "@/lib/prospect/testimonials";

export default function TestimonialsSection() {
  const hero = TESTIMONIALS.find((t) => t.name === "נועה טויטו")!;
  const rest = TESTIMONIALS.filter((t) => t !== hero);
  return (
    <section className="bg-black">
      <div className="mx-auto w-full max-w-6xl overflow-hidden px-5 py-16 lg:px-8 lg:py-28">
        <p className="text-center text-sm font-medium text-brand-gold">לקוחות מספרים</p>
        <h2 className="mt-3 text-balance text-center text-3xl font-semibold leading-tight sm:text-5xl">היעד היה 5 מופעים בחודש. היא סגרה 16.</h2>

        <figure className="mx-auto mt-12 max-w-4xl rounded-2xl border border-brand-gold/40 bg-[#14120e] p-7 sm:p-10">
          <div className="grid items-center gap-8 sm:grid-cols-[auto_1fr]">
            <div className="flex items-end justify-center gap-5" aria-hidden>
              <div className="text-center"><div className="mx-auto w-14 rounded-t-md bg-[#3a3324] pt-[3.75rem]" /><div className="mt-2 text-3xl font-semibold tabular-nums text-[#a39c8d]">5</div><div className="text-xs text-[#7e776a]">היעד</div></div>
              <div className="text-center"><div className="mx-auto w-14 rounded-t-md bg-brand-gold pt-48" /><div className="mt-2 text-3xl font-semibold tabular-nums text-brand-gold">16</div><div className="text-xs text-[#7e776a]">בפועל</div></div>
            </div>
            <div>
              <blockquote className="text-2xl font-medium leading-relaxed text-[#f4f0e7] sm:text-3xl">&quot;{hero.quote}&quot;</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.img} alt={hero.name} className="h-14 w-14 rounded-full border border-[#4e4227] object-cover" />
                <span><span className="block font-semibold text-[#f4f0e7]">{hero.name}</span><span className="block text-sm text-[#a39c8d]">{hero.biz}</span></span>
              </figcaption>
            </div>
          </div>
        </figure>

        {/* בנייד: גלילה אופקית בהחלקה. במסך רחב: רשת */}
        <div className="-mx-5 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {rest.map((t) => (
            <figure key={t.name} className="w-[82%] shrink-0 snap-center rounded-xl border border-[#272319] bg-[#0f0d0a] p-5 sm:w-auto">
              <blockquote className="leading-relaxed text-[#c9c2b3]">&quot;{t.quote}&quot;</blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.img} alt={t.name} className="h-11 w-11 rounded-full border border-[#4e4227] object-cover" />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#f4f0e7]">{t.name}</span><span className="block truncate text-xs text-[#7e776a]">{t.biz}</span></span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
