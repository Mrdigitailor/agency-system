import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mr.digitailor · קודם מודדים, אחר כך מפרסמים",
  description: "תוך שתי דקות תקבל את המידות של העסק שלך בגוגל: כמה אנשים מחפשים אותך, כמה עולה להגיע אליהם, וכמה זה אמור להחזיר.",
};

export default function LpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
