export const metadata = {
  title: "מכונת הלידים",
  robots: { index: false, follow: false },
};

export default function LeadsPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="relative min-h-screen bg-black font-ploni text-white">
      {/* רקע שחור קבוע + זוהר זהב עדין — שפת המוצר של Mr.digitailor */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{ backgroundColor: "#000000", backgroundImage: "radial-gradient(60rem 40rem at 85% -10%, rgba(238,216,155,0.10), transparent 60%), radial-gradient(50rem 40rem at 0% 100%, rgba(238,216,155,0.06), transparent 55%)" }} />
      <div className="relative z-10">
        <header className="border-b border-white/10 bg-black/60 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-7" />
            <span className="text-xs tracking-wide text-brand-gold">מכונת הלידים</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
        <footer className="py-8 text-center text-xs text-white/40">מופעל ע״י Mr.digitailor · שיווק דיגיטלי שתפור עליך</footer>
      </div>
    </div>
  );
}
