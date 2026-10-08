import GoogleG from "./GoogleG";

// תג שותף זמני. יוחלף בתג הרשמי מחשבון השותפים של גוגל.
export default function PartnerChip({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 rounded-lg border border-[#3a3324] bg-[#12100c] py-2 pl-4 pr-2 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white"><GoogleG className="h-4.5 w-4.5" /></span>
      <span className="text-right leading-tight">
        <span className="block text-sm font-semibold text-[#f4f0e7]">Google Partner</span>
        <span className="block text-xs text-[#a39c8d]">שותף רשמי של גוגל</span>
      </span>
    </span>
  );
}
