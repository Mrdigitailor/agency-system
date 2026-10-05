"use client";

// אסקלציות: שאלות שהסוכן לא ידע לענות עליהן. תשובה כאן נשמרת בידע של הסוכן.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { type Escalation, cardCls, inputCls, goldBtn, fmtFull, portalApi, PageTitle } from "./shared";

export default function EscalationsTab({ token, onOpenCount }: { token: string; onOpenCount: (n: number) => void }) {
  const [items, setItems] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await portalApi<{ escalations?: Escalation[] }>(token, { query: "view=escalations" });
    if (res.ok) setItems(res.data.escalations ?? []);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loading) onOpenCount(items.filter((e) => e.status === "open").length); }, [items, loading, onOpenCount]);

  const answer = async (id: string) => {
    const text = (drafts[id] ?? "").trim();
    if (!text) return;
    setSaving(id);
    const res = await portalApi(token, { method: "PATCH", body: { kind: "escalation", id, answer: text } });
    if (res.ok) setItems((es) => es.map((e) => (e.id === id ? { ...e, status: "answered", answer: text } : e)));
    setSaving("");
  };

  return (
    <>
      <PageTitle title="אסקלציות" sub="שאלות שהסוכן לא ידע לענות עליהן. ענה כאן פעם אחת, והסוכן ידע לענות בכל השיחות הבאות" />

      {loading && <div className="py-16 text-center text-white/40"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>}
      {!loading && items.length === 0 && (
        <div className={`${cardCls} px-6 py-14 text-center`}>
          <AlertTriangle className="mx-auto h-10 w-10 text-brand-gold/40" />
          <div className="mt-4 text-lg font-medium text-white/80">אין שאלות פתוחות</div>
          <div className="mx-auto mt-2 max-w-md text-sm text-white/45">כשגולש ישאל את הסוכן שאלה שאין לו עליה תשובה, היא תופיע כאן ותחכה לתשובה שלך.</div>
        </div>
      )}

      {!loading && items.map((e) => (
        <div key={e.id} className={`${cardCls} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-white/40">{fmtFull(e.createdAt)} · {e.chatName}</div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${e.status === "open" ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300"}`}>
              {e.status === "open" ? "ממתין לתשובה" : "נענה · הסוכן למד"}
            </span>
          </div>
          <div className="mt-3 text-[15px] leading-relaxed text-white/90">{e.question}</div>
          {e.status === "answered" ? (
            <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100/90">
              <span className="text-xs text-emerald-300/80">התשובה שלך: </span>{e.answer}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea rows={2} placeholder="כתוב כאן את התשובה, והסוכן ישתמש בה בשיחות הבאות..." value={drafts[e.id] ?? ""}
                onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: ev.target.value }))} className={`${inputCls} flex-1 resize-none`} />
              <button onClick={() => answer(e.id)} disabled={!(drafts[e.id] ?? "").trim() || saving === e.id} className={`${goldBtn} py-2.5`}>
                {saving === e.id ? "שומר..." : "שמור ולמד"}
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
