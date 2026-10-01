"use client";

// הצ'אט הציבורי — סוכן המכירות של דף הנחיתה. עמוד עצמאי שמוטמע גם ב-iframe.
// שחור-זהב באווירת המותג, RTL, כפתורי תשובה מהירה, ושורות התקדמות אמיתיות בזמן המחקר.
import { useCallback, useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "bot"; text: string }

const RESEARCH_STEPS = [
  "ניגש לגוגל לבדוק את התחום שלך...",
  "סורק ביטויי חיפוש רלוונטיים...",
  "מנתח נפחים ומחירי קליק...",
  "מחשב את שרשרת ההמרה...",
];

export default function ProspectChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [quick, setQuick] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [researchStep, setResearchStep] = useState(-1);
  const tokenRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const researchTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const scroll = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);

  // פתיחת שיחה: קודם מנסים לשחזר שיחה קיימת, שחזרה מהדוח לא תאפס את השיחה
  const freshSession = useCallback(async () => {
    const res = await fetch("/api/public/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const d = await res.json();
    if (d.sessionToken) {
      tokenRef.current = d.sessionToken;
      try { localStorage.setItem("mrd_chat_token", d.sessionToken); } catch { /* פרטי */ }
    }
    setMsgs([{ role: "bot", text: d.reply ?? "" }]);
    setQuick(d.quickReplies ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        let saved = "";
        try { saved = localStorage.getItem("mrd_chat_token") ?? ""; } catch { /* פרטי */ }
        if (saved) {
          const res = await fetch(`/api/public/chat?session=${encodeURIComponent(saved)}`);
          const d = await res.json();
          if (d.found && Array.isArray(d.messages) && d.messages.length) {
            tokenRef.current = saved;
            setMsgs(d.messages);
            setQuick(d.quickReplies ?? []);
            scroll();
            return;
          }
        }
        await freshSession();
      } catch {
        setMsgs([{ role: "bot", text: "משהו השתבש בטעינה. רעננו את הדף?" }]);
      }
    })();
  }, [freshSession]);

  const resetChat = useCallback(async () => {
    try { localStorage.removeItem("mrd_chat_token"); } catch { /* פרטי */ }
    setMsgs([]); setQuick([]);
    try { await freshSession(); } catch { /* יטופל ברענון */ }
  }, [freshSession]);

  const startResearchAnim = () => {
    setResearchStep(0);
    let i = 0;
    researchTimer.current = setInterval(() => {
      i = Math.min(i + 1, RESEARCH_STEPS.length - 1);
      setResearchStep(i);
    }, 4000);
  };
  const stopResearchAnim = () => {
    if (researchTimer.current) clearInterval(researchTimer.current);
    setResearchStep(-1);
  };

  // שלב ב' של המחקר: נשלח אוטומטית אחרי ההכרזה, בזמן ששורות ההתקדמות מוצגות
  const continueResearch = useCallback(async () => {
    startResearchAnim();
    try {
      const res = await fetch("/api/public/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: tokenRef.current, message: "__research__" }),
      });
      const d = await res.json();
      setMsgs((m) => [...m, { role: "bot", text: d.reply ?? d.error ?? "משהו השתבש, נסו שוב" }]);
      setQuick(d.quickReplies ?? []);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "החיבור נפל באמצע המחקר. כתבו משהו ונמשיך מאיפה שעצרנו." }]);
    } finally {
      stopResearchAnim();
      setBusy(false); scroll();
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setMsgs((m) => [...m, { role: "user", text: clean }]);
    setQuick([]); setInput(""); setBusy(true); scroll();

    try {
      const res = await fetch("/api/public/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: tokenRef.current, message: clean }),
      });
      const d = await res.json();
      setMsgs((m) => [...m, { role: "bot", text: d.reply ?? d.error ?? "משהו השתבש, נסו שוב" }]);
      setQuick(d.quickReplies ?? []);
      if (d.researching) {
        // הסוכן הכריז על המחקר; עכשיו הוא באמת רץ, עם שורות ההתקדמות האמיתיות
        scroll();
        await continueResearch();
        return;
      }
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "החיבור נפל לרגע. נסו שוב?" }]);
    }
    setBusy(false); scroll();
  }, [busy, continueResearch]);

  // קישורים בתוך הודעות בוט הופכים ללחיצים
  const renderText = (t: string) => {
    const parts = t.split(/(https?:\/\/\S+)/g);
    return parts.map((p, i) =>
      /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" className="font-semibold text-[#eed89b] underline">צפייה בדוח המלא</a>
        : <span key={i}>{p}</span>
    );
  };

  return (
    <div dir="rtl" className="flex h-dvh flex-col bg-[#0a0908] text-[#f4f0e7]" style={{ fontFamily: "Ploni, Assistant, sans-serif" }}>
      {/* כותרת */}
      <header className="flex items-center gap-3 border-b border-[#272319] bg-black px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-8" />
        <div className="mr-auto flex items-center gap-3">
          <button onClick={resetChat} className="text-xs text-[#7e776a] underline decoration-[#4e4227] hover:text-[#eed89b]">שיחה חדשה</button>
          <span className="flex items-center gap-1.5 text-xs text-[#7e776a]"><span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" /> זמין עכשיו</span>
        </div>
      </header>

      {/* הודעות */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-5">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "bot"
            ? "max-w-[88%] whitespace-pre-line rounded-2xl rounded-br-md bg-[#1a1714] px-4 py-2.5 text-[15px] leading-relaxed shadow"
            : "mr-auto max-w-[75%] whitespace-pre-line rounded-2xl rounded-bl-md border border-[#4e4227] bg-[#29230f] px-4 py-2 text-[14.5px] text-[#eed89b]"}>
            {m.role === "bot" ? renderText(m.text) : m.text}
          </div>
        ))}

        {/* מחוון הקלדה / התקדמות מחקר */}
        {busy && (
          <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[#1a1714] px-4 py-3 text-[13px] text-[#9a9184]">
            {researchStep >= 0 ? (
              <span className="font-mono">{RESEARCH_STEPS[researchStep]}</span>
            ) : (
              <span className="inline-flex gap-1">
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c8ab5e]" style={{ animationDelay: "0ms" }} />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c8ab5e]" style={{ animationDelay: "150ms" }} />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#c8ab5e]" style={{ animationDelay: "300ms" }} />
              </span>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* תשובות מהירות */}
      {quick.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {quick.map((q) => (
            <button key={q} onClick={() => send(q)}
              className="rounded-full border border-[#c8ab5e] px-4 py-1.5 text-sm text-[#eed89b] transition-colors hover:bg-[#eed89b] hover:text-black">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* שורת קלט */}
      <div className="flex gap-2 border-t border-[#272319] bg-black px-4 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
          disabled={busy}
          placeholder="כתבו כאן..."
          className="flex-1 rounded-full border border-[#272319] bg-[#131110] px-4 py-2.5 text-[15px] text-[#f4f0e7] placeholder:text-[#7e776a] focus:border-[#c8ab5e] focus:outline-none"
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()}
          className="rounded-full bg-[#eed89b] px-5 py-2.5 text-sm font-bold text-black transition-all hover:brightness-95 disabled:opacity-40">
          שלח
        </button>
      </div>
    </div>
  );
}
