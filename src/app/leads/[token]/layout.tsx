export const metadata = {
  title: "מכונת הלידים",
  robots: { index: false, follow: false },
};

export default function LeadsPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="relative min-h-screen bg-black font-ploni text-white">
      {/* רקע שחור קבוע + זוהר זהב עדין — שפת המוצר של Mr.digitailor */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{ backgroundColor: "#000000", backgroundImage: "radial-gradient(60rem 40rem at 85% -10%, rgba(238,216,155,0.08), transparent 60%), radial-gradient(50rem 40rem at 0% 100%, rgba(238,216,155,0.05), transparent 55%)" }} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
