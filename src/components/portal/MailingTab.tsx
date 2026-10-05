"use client";

// דיוור: כל המיילים ברצף בטבלה אחת, עם המספרים של כל מייל. לחיצה פותחת עריכה והמלצות.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Info } from "lucide-react";
import { type MailingRow, cardCls, portalApi, pct, PageTitle } from "./shared";
import EmailModal from "./EmailModal";

export default function MailingTab({ token, demo }: { token: string; demo: boolean }) {
  const [rows, setRows] = useState<MailingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await portalApi<{ emails?: MailingRow[] }>(token, { query: "view=mailing" });
    if (res.ok) setRows(res.data.emails ?? []);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const toggle = (row: MailingRow) => {
    setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, enabled: !r.enabled } : r)));
    portalApi(token, { method: "PATCH", body: { kind: "emailEnabled", key: row.key, enabled: !row.enabled } });
  };

  const fewTracked = rows.length > 0 && rows.every((r) => r.openRate === null);

  return (
    <>
      <PageTitle title="דיוור" sub="רצף המיילים שהליד מקבל אחרי השיחה. לכל מייל תפקיד אחד, ואפשר לערוך אותו ולראות איך השינוי משפיע" />

      {fewTracked && !loading && (
        <div className={`${cardCls} flex items-start gap-3 px-4 py-3 text-sm text-white/60`}>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
          <span>אחוזי הפתיחה וההקלקה יופיעו אחרי שיצטברו לפחות 5 שליחות מדודות לכל מייל. מיילים שנשלחו לפני הפעלת המעקב נספרים ב&quot;נשלחו&quot; בלבד.</span>
        </div>
      )}

      <div className={`${cardCls} overflow-x-auto`}>
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-white/40">
              <th className="px-4 py-3 font-medium">המייל</th>
              <th className="px-4 py-3 font-medium">מתי נשלח</th>
              <th className="px-4 py-3 font-medium">נושא</th>
              <th className="px-4 py-3 font-medium">נשלחו</th>
              <th className="px-4 py-3 font-medium">נפתחו</th>
              <th className="px-4 py-3 font-medium">הקליקו</th>
              <th className="px-4 py-3 font-medium">קבעו פגישה</th>
              <th className="px-4 py-3 font-medium">גרסה</th>
              <th className="px-4 py-3 font-medium">פעיל</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-4 py-12 text-center text-white/40"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.key} onClick={() => setOpenKey(r.key)}
                className={`cursor-pointer border-b border-white/5 transition-colors duration-200 hover:bg-white/[0.05] ${r.enabled ? "" : "opacity-50"}`}>
                <td className="whitespace-nowrap px-4 py-3.5 font-medium text-white">{r.label}</td>
                <td className="px-4 py-3.5 text-xs text-white/50">{r.when}</td>
                <td className="max-w-[260px] truncate px-4 py-3.5 text-xs text-white/70">{r.subject}</td>
                <td className="px-4 py-3.5 text-white/70">{r.sent}</td>
                <td className="px-4 py-3.5 text-emerald-300">{pct(r.openRate)}</td>
                <td className="px-4 py-3.5 text-sky-300">{pct(r.clickRate)}</td>
                <td className="px-4 py-3.5 text-brand-gold">{pct(r.advanceRate)}</td>
                <td className="px-4 py-3.5 text-xs text-white/50">{r.version}</td>
                <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => toggle(r)} role="switch" aria-checked={r.enabled} aria-label={`${r.label}: ${r.enabled ? "פעיל" : "כבוי"}`}
                    className={`relative block h-6 w-11 rounded-full transition-colors duration-200 ${r.enabled ? "bg-brand-gold" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all duration-200 ${r.enabled ? "right-0.5" : "right-[22px]"}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-white/30">&quot;קבעו פגישה&quot; סופר לידים שקבעו פגישה עד שבוע אחרי שהמייל נשלח. &quot;נפתחו&quot; הוא מדד מקורב, &quot;הקליקו&quot; מדויק יותר.</div>

      {openKey && <EmailModal token={token} emailKey={openKey} demo={demo} onClose={() => setOpenKey(null)} onSaved={load} />}
    </>
  );
}
