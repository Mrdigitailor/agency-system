"use client";

// שיחות: כל שיחה שהתקיימה עם הסוכן, עם הקמפיין, קבוצת המודעות ומילת המפתח שהביאו אותה.
import { Loader2 } from "lucide-react";
import { type Row, STATUS_CLS, cardCls, fmtFull, PageTitle, DaysSelect } from "./shared";

export default function ConversationsTab({ rows, loading, days, setDays, demo, onOpen }: {
  rows: Row[]; loading: boolean; days: number; setDays: (n: number) => void; demo: boolean; onOpen: (row: Row) => void;
}) {
  return (
    <>
      <PageTitle title="שיחות" sub="כל שיחה שהתקיימה עם הסוכן: מאיזה קמפיין, קבוצת מודעות ומילת מפתח היא הגיעה, והשיחה המלאה לניתוח">
        {!demo && <DaysSelect days={days} setDays={setDays} />}
      </PageTitle>

      <div className={`${cardCls} min-h-[72vh] overflow-x-auto`}>
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-white/40">
              <th className="px-4 py-3 font-medium">תאריך</th>
              <th className="px-4 py-3 font-medium">ליד</th>
              <th className="px-4 py-3 font-medium">קמפיין</th>
              <th className="px-4 py-3 font-medium">קבוצת מודעות</th>
              <th className="px-4 py-3 font-medium">מילת מפתח</th>
              <th className="px-4 py-3 font-medium">הודעות</th>
              <th className="px-4 py-3 font-medium">תוצאה</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-12 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-white/40">אין עדיין שיחות בתקופה הזאת</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.05]">
                <td className="whitespace-nowrap px-4 py-3.5 text-white/40">{fmtFull(r.createdAt)}</td>
                <td className="px-4 py-3.5">
                  <div className="font-medium text-white">{r.name || "אנונימי"}</div>
                  <div className="text-xs text-white/40">{r.business}</div>
                </td>
                <td className="px-4 py-3.5 text-xs text-white/60">{r.utmCampaign || "-"}</td>
                <td className="px-4 py-3.5 text-xs text-white/60">{r.utmContent || "-"}</td>
                <td className="max-w-[170px] truncate px-4 py-3.5 text-xs text-white/60">{r.source !== r.utmSource ? r.source : "-"}</td>
                <td className="px-4 py-3.5 text-xs text-white/50">{r.msgCount}</td>
                <td className="px-4 py-3.5">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLS[r.status] ?? "bg-brand-gold/15 text-brand-gold"}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
