import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mr.digitailor · כמה הפרסום בגוגל אמור להחזיר בתחום שלכם",
  description: "לפני שמשקיעים שקל בפרסום בגוגל, בדקו כמה זה אמור להחזיר בתחום שלכם. שתי דקות בצ'אט, ודוח עם המספרים של התחום שלכם.",
};

export default function LpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
