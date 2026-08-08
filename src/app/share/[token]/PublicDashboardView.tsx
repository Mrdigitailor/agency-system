"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, Send } from "lucide-react";
import { WidgetGrid, type WidgetDTO } from "@/components/dashboard/DashboardWidgets";

interface Dto {
  client: { name: string; currency: string; clientType: string };
  range: { since: string; until: string };
  widgets: WidgetDTO[];
}

const RANGES = [
  { key: "month", label: "החודש" },
  { key: "7", label: "7 ימים" },
  { key: "28", label: "28 ימים" },
  { key: "90", label: "90 ימים" },
  { key: "custom", label: "מותאם" },
];

function rangeDates(key: string): { since: string; until: string } {
  const today = new Date();
  const until = today.toISOString().slice(0, 10);
  if (key === "month") {
    return { since: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, until };
  }
  return { since: new Date(today.getTime() - (Number(key) - 1) * 86400000).toISOString().slice(0, 10), until };
}

const SUGGESTIONS = ["מה זה יחס המרה?", "האם ההכנסות השתפרו לעומת התקופה הקודמת?", "מאיזה מקור מגיעות הכי הרבה תוצאות?"];

export default function PublicDashboardView({ token }: { token: string }) {
  const [dto, setDto] = useState<Dto | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  // ברירת מחדל 28 יום — "החודש" בתחילת חודש מציג יומיים-שלושה של דאטה ונראה ריק
  const [range, setRange] = useState("28");
  const [customSince, setCustomSince] = useState(() => rangeDates("month").since);
  const [customUntil, setCustomUntil] = useState(() => rangeDates("month").until);

  // התאריכים בפועל — לפי הפריסט או טווח מותאם שהלקוח בחר
  const { since, until } = range === "custom" ? { since: customSince, until: customUntil } : rangeDates(range);

  // צ'אט AI
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const ask = useCallback(async (q: string) => {
    const text = q.trim();
    if (!text || asking) return;
    setQuestion("");
    setChat((c) => [...c, { role: "user", text }]);
    setAsking(true);
    try {
      const res = await fetch(`/api/public/dashboard/${token}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, since, until }) });
      const data = await res.json();
      setChat((c) => [...c, { role: "ai", text: res.ok ? data.answer : (data.error ?? "שגיאה") }]);
    } catch {
      setChat((c) => [...c, { role: "ai", text: "שגיאה בחיבור. נסה שוב." }]);
    } finally {
      setAsking(false);
    }
  }, [token, since, until, asking]);

  const load = useCallback(async (s: string, u: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/dashboard/${token}?since=${s}&until=${u}`);
      if (!res.ok) { setUnavailable(true); return; }
      setDto(await res.json());
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(since, until); }, [load, since, until]);

  if (unavailable) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-white">הדשבורד אינו זמין</p>
        <p className="mt-2 text-sm text-white/50">ייתכן שהקישור בוטל או שגוי. פנה לסוכנות לקבלת קישור מעודכן.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{dto?.client.name ?? ""}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/50">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-gold" />
            נתונים לתקופה {new Date(since).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} – {new Date(until).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} · מתעדכן אוטומטית
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-0.5 backdrop-blur-sm">
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r.key ? "bg-brand-gold text-brand-dark" : "text-white/60 hover:text-white"}`}>{r.label}</button>
            ))}
          </div>
          {range === "custom" && (
            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1" dir="ltr">
              <input type="date" value={customSince} max={customUntil} onChange={(e) => setCustomSince(e.target.value)} className="bg-transparent text-xs text-white/90 focus:outline-none [color-scheme:dark]" />
              <span className="text-white/40">–</span>
              <input type="date" value={customUntil} min={customSince} max={rangeDates("month").until} onChange={(e) => setCustomUntil(e.target.value)} className="bg-transparent text-xs text-white/90 focus:outline-none [color-scheme:dark]" />
            </div>
          )}
        </div>
      </div>

      {loading && !dto ? (
        <div className="flex items-center justify-center py-20 text-white/50"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : dto ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <WidgetGrid widgets={dto.widgets} currency={dto.client.currency} dark />
        </div>
      ) : null}

      {/* שאל את ה-AI על המספרים */}
      {dto && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_0_0_1px_rgba(238,216,155,0.04)] backdrop-blur-sm">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-gold" /><h3 className="text-sm font-semibold text-white">שאל את ה-AI על הנתונים</h3></div>
          <p className="mt-1 text-xs text-white/50">שאל כל שאלה על הביצועים שלך — לדוגמה אם מדד השתפר, או מה משמעות מספר.</p>

          {chat.length > 0 && (
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {chat.map((m, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-brand-gold/15 text-white" : "whitespace-pre-wrap bg-white/[0.04] text-white/90"}`}>{m.text}</div>
              ))}
              {asking && <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> מנתח...</div>}
            </div>
          )}

          {chat.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 hover:bg-brand-gold/10 hover:text-white">{s}</button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
              rows={1}
              dir="rtl"
              placeholder="כתוב שאלה..."
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-brand-gold focus:outline-none"
            />
            <button onClick={() => ask(question)} disabled={asking || !question.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
