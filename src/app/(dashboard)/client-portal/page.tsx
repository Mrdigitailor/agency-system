"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { WidgetGrid, type WidgetDTO } from "@/components/dashboard/DashboardWidgets";
import { Loader2, Sparkles, Send, MessageSquare } from "lucide-react";

interface DashboardDTO { client: { name: string; currency: string }; widgets: WidgetDTO[] }
interface ChatMsg { id: string; content: string; authorName: string; authorId: string | null; createdAt: string }

const cardClass = "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";
const RANGES = [{ days: "7", label: "7 ימים" }, { days: "28", label: "28 ימים" }, { days: "month", label: "החודש" }];
const SUGGESTIONS = ["מה זה יחס המרה?", "האם המספרים השתפרו מהתקופה הקודמת?", "מאיפה מגיעות הכי הרבה תוצאות?"];

function rangeDates(key: string): { since: string; until: string } {
  const today = new Date();
  const until = today.toISOString().slice(0, 10);
  if (key === "month") return { since: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, until };
  return { since: new Date(today.getTime() - (Number(key) - 1) * 86400000).toISOString().slice(0, 10), until };
}

export default function ClientPortalPage() {
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id ?? "";

  const [dto, setDto] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("month");

  const [aiChat, setAiChat] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadDashboard = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const { since, until } = rangeDates(key);
      const res = await fetch(`/api/client-portal/dashboard?since=${since}&until=${until}`);
      if (res.ok) setDto(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChat = useCallback(async () => {
    const res = await fetch(`/api/client-portal/chat`);
    if (res.ok) setMsgs((await res.json()).messages ?? []);
  }, []);

  useEffect(() => { loadDashboard(range); }, [loadDashboard, range]);
  useEffect(() => { loadChat(); const t = setInterval(loadChat, 20000); return () => clearInterval(t); }, [loadChat]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || asking) return;
    setQuestion("");
    setAiChat((c) => [...c, { role: "user", text }]);
    setAsking(true);
    try {
      const { since, until } = rangeDates(range);
      const res = await fetch(`/api/client-portal/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, since, until }) });
      const data = await res.json();
      setAiChat((c) => [...c, { role: "ai", text: res.ok ? data.answer : (data.error ?? "שגיאה") }]);
    } finally {
      setAsking(false);
    }
  }

  async function sendMsg() {
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    setSending(true);
    try {
      await fetch(`/api/client-portal/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      await loadChat();
    } finally {
      setSending(false);
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">שלום{dto?.client.name ? ` ${dto.client.name}` : ""} 👋</h1>
        <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-brand-light p-0.5">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setRange(r.days)} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r.days ? "bg-brand-gold text-brand-dark" : "text-brand-muted hover:text-brand-dark"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* דשבורד חי */}
      {loading && !dto ? (
        <div className="flex items-center justify-center py-16 text-brand-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : dto && dto.widgets.length > 0 ? (
        <div className={loading ? "opacity-60 transition-opacity" : ""}><WidgetGrid widgets={dto.widgets} currency={dto.client.currency} /></div>
      ) : (
        <div className={cardClass}><p className="py-8 text-center text-sm text-brand-muted">הדשבורד בהכנה. צוות DigiTailors מסדר את הנתונים שלך.</p></div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI שיחתי */}
        <div className={cardClass}>
          <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-gold" /><h3 className="text-sm font-semibold text-brand-dark">שאל את ה-AI על הנתונים</h3></div>
          {aiChat.length > 0 && (
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {aiChat.map((m, i) => <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-brand-gold/10 text-brand-dark" : "whitespace-pre-wrap bg-brand-bg text-brand-dark"}`}>{m.text}</div>)}
              {asking && <div className="flex items-center gap-2 px-3 py-2 text-sm text-brand-muted"><Loader2 className="h-4 w-4 animate-spin" /> מנתח...</div>}
            </div>
          )}
          {aiChat.length === 0 && <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border border-brand-border bg-brand-bg px-3 py-1.5 text-xs text-brand-muted hover:bg-brand-gold/10 hover:text-brand-dark">{s}</button>)}</div>}
          <div className="mt-3 flex items-end gap-2">
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }} rows={1} dir="rtl" placeholder="שאל שאלה על המספרים..." className="w-full resize-none rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm focus:border-brand-gold focus:outline-none" />
            <button onClick={() => ask(question)} disabled={asking || !question.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">{asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
          </div>
        </div>

        {/* צ'אט עם הצוות */}
        <div className={cardClass}>
          <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand-gold" /><h3 className="text-sm font-semibold text-brand-dark">צ'אט עם צוות DigiTailors</h3></div>
          <div className="mt-3 max-h-72 min-h-[8rem] space-y-2 overflow-y-auto">
            {msgs.length === 0 ? <p className="py-6 text-center text-xs text-brand-muted">אין הודעות עדיין. כתבו לנו מה תרצו לדעת.</p> : msgs.map((m) => {
              const mine = m.authorId === myId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-brand-gold/10 text-brand-dark" : "bg-brand-bg text-brand-dark"}`}>
                    {!mine && <p className="mb-0.5 text-[10px] font-semibold text-brand-muted">{m.authorName}</p>}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} rows={1} dir="rtl" placeholder="כתוב הודעה לצוות..." className="w-full resize-none rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm focus:border-brand-gold focus:outline-none" />
            <button onClick={sendMsg} disabled={sending || !draft.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
