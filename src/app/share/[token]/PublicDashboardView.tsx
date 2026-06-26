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
];

function rangeDates(key: string): { since: string; until: string } {
  const today = new Date();
  const until = today.toISOString().slice(0, 10);
  if (key === "month") {
    return { since: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, until };
  }
  return { since: new Date(today.getTime() - (Number(key) - 1) * 86400000).toISOString().slice(0, 10), until };
}
function rangeParams(key: string): string {
  const { since, until } = rangeDates(key);
  return `since=${since}&until=${until}`;
}

const SUGGESTIONS = ["מה זה יחס המרה?", "האם ההכנסות השתפרו לעומת התקופה הקודמת?", "מאיזה מקור מגיעות הכי הרבה תוצאות?"];

export default function PublicDashboardView({ token }: { token: string }) {
  const [dto, setDto] = useState<Dto | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [range, setRange] = useState("month");

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
      const { since, until } = rangeDates(range);
      const res = await fetch(`/api/public/dashboard/${token}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, since, until }) });
      const data = await res.json();
      setChat((c) => [...c, { role: "ai", text: res.ok ? data.answer : (data.error ?? "שגיאה") }]);
    } catch {
      setChat((c) => [...c, { role: "ai", text: "שגיאה בחיבור. נסה שוב." }]);
    } finally {
      setAsking(false);
    }
  }, [token, range, asking]);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/dashboard/${token}?${rangeParams(key)}`);
      if (!res.ok) { setUnavailable(true); return; }
      setDto(await res.json());
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(range); }, [load, range]);

  if (unavailable) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-brand-dark">הדשבורד אינו זמין</p>
        <p className="mt-2 text-sm text-brand-muted">ייתכן שהקישור בוטל או שגוי. פנה לסוכנות לקבלת קישור מעודכן.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">{dto?.client.name ?? ""}</h1>
        <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light p-0.5">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r.key ? "bg-brand-gold text-brand-dark" : "text-brand-muted hover:text-brand-dark"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {loading && !dto ? (
        <div className="flex items-center justify-center py-20 text-brand-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : dto ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <WidgetGrid widgets={dto.widgets} currency={dto.client.currency} />
        </div>
      ) : null}

      {/* שאל את ה-AI על המספרים */}
      {dto && (
        <div className="rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm">
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-gold" /><h3 className="text-sm font-semibold text-brand-dark">שאל את ה-AI על הנתונים</h3></div>
          <p className="mt-1 text-xs text-brand-muted">שאל כל שאלה על הביצועים שלך — לדוגמה אם מדד השתפר, או מה משמעות מספר.</p>

          {chat.length > 0 && (
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {chat.map((m, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-brand-gold/10 text-brand-dark" : "whitespace-pre-wrap bg-brand-bg text-brand-dark"}`}>{m.text}</div>
              ))}
              {asking && <div className="flex items-center gap-2 px-3 py-2 text-sm text-brand-muted"><Loader2 className="h-4 w-4 animate-spin" /> מנתח...</div>}
            </div>
          )}

          {chat.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-muted hover:bg-brand-gold/10 hover:text-brand-dark">{s}</button>
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
              className="w-full resize-none rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm focus:border-brand-gold focus:outline-none"
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
