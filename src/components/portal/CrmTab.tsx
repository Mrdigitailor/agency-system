"use client";

// CRM: טבלת הלידים מהצ'אט. מטרה אחת: להציג לידים ולאפשר לעבוד עליהם.
import { useState } from "react";
import { Mail, MailOpen, MousePointerClick, Calendar, Loader2, Search, ThumbsUp, ThumbsDown, Clock, Check } from "lucide-react";
import { type Row, STATUS_CLS, cardCls, inputCls, fmtDate, fmtFull, isDue, PageTitle, DaysSelect } from "./shared";

export default function CrmTab({ rows, loading, days, setDays, demo, onOpen, onRelevant }: {
  rows: Row[]; loading: boolean; days: number; setDays: (n: number) => void; demo: boolean;
  onOpen: (row: Row) => void; onRelevant: (rowId: string, relevant: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);

  // "מחכים לי": פעולה שהגיע זמנה, או פגישה שמועדה עבר ועוד לא סומן מה קרה בה
  const waiting = (r: Row) => isDue(r.nextActionAt) || Boolean(r.meetingPending && !r.customerId);
  const dueCount = rows.filter(waiting).length;
  const filtered = rows.filter((r) => {
    if (onlyDue && !waiting(r)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.email, r.phone, r.business, r.source].some((v) => v.toLowerCase().includes(q));
  });

  return (
    <>
      <PageTitle title="CRM · לידים" sub="כל מי שדיבר עם הסוכן החכם שלך: מי הם, מאיפה הגיעו, ומה הצעד הבא">
        {!demo && <DaysSelect days={days} setDays={setDays} />}
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם, טלפון, מייל..."
            className={`${inputCls} w-72 py-2 pl-3 pr-9`} />
        </div>
        <button onClick={() => setOnlyDue((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-200 ${onlyDue ? "border-brand-gold bg-brand-gold/15 text-brand-gold" : "border-white/15 text-white/60 hover:text-white"}`}>
          <Clock className="h-4 w-4" /> מחכים לי היום
          <span className={`rounded-full px-1.5 text-xs font-semibold ${dueCount > 0 ? "bg-brand-gold text-black" : "bg-white/10 text-white/50"}`}>{dueCount}</span>
        </button>
      </div>

      <div className={`${cardCls} min-h-[70vh] overflow-x-auto`}>
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-white/40">
              <th className="whitespace-nowrap px-3 py-3 font-medium">תאריך</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">ליד</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">פרטי קשר</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">מקור</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">מדיום</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">מילת חיפוש</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">מיילים</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">פגישה</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">הצעד הבא</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">רלוונטי</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="px-4 py-12 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-white/40">{onlyDue ? "אין לידים שמחכים לך היום" : "אין עדיין שיחות בתקופה הזאת"}</td></tr>
            )}
            {!loading && filtered.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.05]">
                <td className="whitespace-nowrap px-3 py-3.5 text-white/40">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-3.5">
                  <div className="whitespace-nowrap font-medium text-white">{r.name || "אנונימי"}</div>
                  <div className="max-w-[170px] truncate text-xs text-white/40">{r.business}</div>
                </td>
                <td className="px-3 py-3.5 text-xs text-white/50">
                  <div>{r.email}</div><div dir="ltr" className="text-right">{r.phone}</div>
                </td>
                <td className="px-3 py-3.5 text-xs text-white/60">{r.utmSource}</td>
                <td className="px-3 py-3.5 text-xs text-white/60">{r.utmMedium}</td>
                <td className="max-w-[150px] truncate px-3 py-3.5 text-xs text-white/50">{r.source !== r.utmSource ? r.source : ""}</td>
                <td className="px-3 py-3.5">
                  {r.emailsSent > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                      <Mail className="h-3.5 w-3.5" /> {r.emailsSent}
                      {r.emailsOpened > 0 && <><MailOpen className="h-3.5 w-3.5 text-emerald-300" /> {r.emailsOpened}</>}
                      {r.emailsClicked > 0 && <><MousePointerClick className="h-3.5 w-3.5 text-sky-300" /> {r.emailsClicked}</>}
                    </span>
                  ) : <span className="text-xs text-white/25">-</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-xs">
                  {r.meetingAt && !r.cancelledAt && <span className="inline-flex items-center gap-1 text-emerald-300"><Calendar className="h-3.5 w-3.5" /> {fmtFull(r.meetingAt)}</span>}
                  {r.cancelledAt && <span className="text-red-300">בוטלה</span>}
                  {r.meetingPending && !r.customerId && <div className="mt-1 font-medium text-brand-gold">התקיימה? לסמן בכרטיס</div>}
                </td>
                <td className="max-w-[170px] px-3 py-3.5 text-xs">
                  {r.nextActionAt ? (
                    <div className={isDue(r.nextActionAt) ? "text-brand-gold" : "text-white/55"}>
                      <div className="inline-flex items-center gap-1 whitespace-nowrap font-medium"><Clock className="h-3.5 w-3.5" /> {fmtFull(r.nextActionAt)}</div>
                      <div className="truncate text-white/45">{r.nextActionNote}</div>
                    </div>
                  ) : <span className="text-white/25">-</span>}
                </td>
                <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                  <span className="inline-flex gap-1">
                    <button onClick={() => onRelevant(r.id, r.relevant === "yes" ? "" : "yes")} title="ליד רלוונטי" aria-label="ליד רלוונטי"
                      className={`rounded-md p-1.5 transition-colors duration-200 ${r.relevant === "yes" ? "bg-emerald-400/20 text-emerald-300" : "text-white/25 hover:bg-white/10 hover:text-white/60"}`}>
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onRelevant(r.id, r.relevant === "no" ? "" : "no")} title="ליד לא רלוונטי" aria-label="ליד לא רלוונטי"
                      className={`rounded-md p-1.5 transition-colors duration-200 ${r.relevant === "no" ? "bg-red-400/20 text-red-300" : "text-white/25 hover:bg-white/10 hover:text-white/60"}`}>
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLS[r.status] ?? "bg-brand-gold/15 text-brand-gold"}`}>
                    {r.customerId && <Check className="h-3 w-3" />}{r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
