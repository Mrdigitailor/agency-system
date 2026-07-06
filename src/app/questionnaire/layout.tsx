export const metadata = {
  title: "שאלון היכרות — Mr.digitailor",
  robots: { index: false, follow: false },
};

export default function QuestionnaireLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-brand-bg font-ploni">
      <header className="border-b border-brand-border bg-black">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-7" />
          <span className="text-xs text-brand-gold">שאלון היכרות</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="py-8 text-center text-xs text-brand-muted">Mr.digitailor — סוכנות שיווק ופרסום דיגיטלי</footer>
    </div>
  );
}
