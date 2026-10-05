"use client";

// תובנות מהשיחות: סיכום שנוצר מתמלילי השיחות. אילו שאלות חוזרות, למה מסרבים, איפה נוטשים.
import { useCallback, useEffect, useState } from "react";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { type Insight, cardCls, ghostBtn, fmtYmd, fmtFull, portalApi, PageTitle } from "./shared";

function CountList({ title, items, tone }: { title: string; items: Insight["topQuestions"]; tone: string }) {
  return (
    <div className={`${cardCls} p-4`}>
      <div className="mb-3 text-sm font-medium text-white/80">{title}</div>
      {items.length === 0 && <div className="py-3 text-center text-xs text-white/40">לא עלה בשיחות של התקופה</div>}
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <span className={`mt-0.5 flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${tone}`}>{it.count}</span>
            <span className="text-white/85">{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InsightsTab({ token, demo }: { token: string; demo: boolean }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [minChats, setMinChats] = useState(3);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await portalApi<{ insight?: Insight | null; canGenerate?: boolean; minChats?: number }>(token, { query: "view=insights" });
    if (res.ok) { setInsight(res.data.insight ?? null); setCanGenerate(Boolean(res.data.canGenerate)); setMinChats(res.data.minChats ?? 3); }
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true); setMessage("");
    const res = await portalApi<{ insight?: Insight; tooFew?: boolean; error?: string }>(token, { method: "POST", body: { kind: "insights" } });
    if (res.ok && res.data.insight) { setInsight(res.data.insight); setCanGenerate(false); }
    else if (res.data.tooFew) setMessage(`צריך לפחות ${minChats} שיחות אמיתיות ב-30 הימים האחרונים כדי להפיק תובנות.`);
    else setMessage(res.data.error ?? "יצירת התובנות נכשלה, נסו שוב בעוד כמה דקות.");
    setGenerating(false);
  };

  return (
    <>
      <PageTitle title="תובנות מהשיחות" sub="מה עולה מהשיחות עם הסוכן: מה שואלים, למה מסרבים, ואיפה נוטשים">
        {!demo && (canGenerate || !insight) && (
          <button onClick={generate} disabled={generating} className={ghostBtn}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {generating ? "מנתח את השיחות..." : insight ? "רענון התובנות" : "הפקת תובנות"}
          </button>
        )}
      </PageTitle>

      {message && <div className={`${cardCls} px-4 py-3 text-sm text-amber-200`}>{message}</div>}
      {loading && <div className="py-16 text-center text-white/40"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>}

      {!loading && !insight && !message && (
        <div className={`${cardCls} px-6 py-14 text-center`}>
          <Lightbulb className="mx-auto h-10 w-10 text-brand-gold/40" />
          <div className="mt-4 text-lg font-medium text-white/80">עוד אין תובנות</div>
          <div className="mx-auto mt-2 max-w-md text-sm text-white/45">התובנות מופקות אוטומטית פעם בשבוע מהשיחות עם הסוכן, ואפשר להפיק אותן גם עכשיו.</div>
        </div>
      )}

      {insight && (
        <>
          <div className="text-xs text-white/35">
            מבוסס על {insight.chatCount} שיחות, {fmtYmd(insight.from)} עד {fmtYmd(insight.to)} · עודכן {fmtFull(insight.createdAt)}
          </div>
          <div className={`${cardCls} border-r-2 border-r-brand-gold p-5`}>
            <div className="text-xs text-white/40">בשורה התחתונה</div>
            <div className="mt-1 text-[15px] leading-relaxed text-white/90">{insight.summary}</div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <CountList title="השאלות שחוזרות" items={insight.topQuestions} tone="bg-sky-400/15 text-sky-300" />
            <CountList title="למה מסרבים" items={insight.objections} tone="bg-amber-400/15 text-amber-300" />
            <CountList title="איפה נוטשים את השיחה" items={insight.dropoffs} tone="bg-red-400/15 text-red-300" />
          </div>
          {insight.recommendations.length > 0 && (
            <div className={`${cardCls} p-4`}>
              <div className="mb-3 text-sm font-medium text-white/80">מה כדאי לעשות</div>
              <div className="space-y-2">
                {insight.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm text-white/85">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-xs font-semibold text-brand-gold">{i + 1}</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-white/30">הספירות הן הערכה של הניתוח האוטומטי ולא מניין מדויק.</div>
        </>
      )}
    </>
  );
}
