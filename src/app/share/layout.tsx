export const metadata = {
  title: "דשבורד תוצאות",
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-brand-bg font-ploni">
      <header className="border-b border-brand-border bg-black">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-7" />
          <span className="text-xs text-brand-gold">דשבורד תוצאות</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      <footer className="py-8 text-center text-xs text-brand-muted">מופעל ע״י Mr.digitailor</footer>
    </div>
  );
}
