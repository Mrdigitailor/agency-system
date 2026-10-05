"use client";

// הצ'אט הציבורי — סוכן המכירות של דף הנחיתה. עמוד עצמאי שמוטמע גם ב-iframe.
// שחור-זהב באווירת המותג, RTL, כפתורי תשובה מהירה, ושורות התקדמות אמיתיות בזמן המחקר.
import { useCallback, useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "bot"; text: string }

const TESTIMONIALS = [
  { name: "הדס מליק", biz: "חברת חדרי בריחה ניידים", img: "/images/testimonials/t4.png", quote: "ממליצה בחום, סער אלוף. יודע לדייק את הפרסומים באופן מקצועי, וכל ההתנהלות נעימה וחברית. הקפיץ לי את הפרסום והשיווק כמה רמות למעלה" },
  { name: "נועה טויטו", biz: "יוצרת המופע \"בלבוסטע\"", img: "/images/testimonials/t1.png", quote: "כל קמפיין עם מאות פניות. בחודש ימים בלבד סגרתי 16 מופעים, כשהיעד היה חמישה" },
  { name: "עופרי מצא", biz: "מותג אופנה ומכון שיזוף", img: "/images/testimonials/t5.png", quote: "כל בעל עסק צריך את סער איתו! מקצועי, סבלני, תמיד נכון לעזור. הבחירה הכי טובה שעשיתי לעסק שלי" },
  { name: "יואב לאמי", biz: "משרד מיתוג ועמודי נחיתה", img: "/images/testimonials/t6.png", quote: "בכל הנוגע לדיגיטל, אפשר לסמוך עליו בעיניים עצומות. התוצאות הדהימו והחזר ההשקעה היה מיידי" },
  { name: "נירן רוזנשטיין", biz: "אתר איקומרס בתחום הביוטי", img: "/images/testimonials/t2.png", quote: "מאז שהתחלנו לעבוד איתו אנחנו רואים שיפור משמעותי, הרבה פניות ורכישות. ממליץ בחום על שירותיו" },
  { name: "תמיר גליליאן", biz: "מותג טפטים מוביל בישראל", img: "/images/testimonials/t3.png", quote: "תותח על. מנהל קמפיינים מקצועי שתמיד זמין. ממליץ לכל מי שרוצה לקחת את העסק שלב נוסף קדימה" },
];

// רקע באווירת המותג: איור פוליגונלי של דמות החייט מול מחשב, מפצחת משפך שיווק.
// מעומעם בכוונה + שכבת האפלה בקצוות — אווירה, לא תמונה שמפריעה לקריאה.
const SCENE_BG = (
  <div aria-hidden className="pointer-events-none fixed inset-0">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/images/chat-bg.webp" alt="" className="h-full w-full object-cover opacity-25" />
    <div className="absolute inset-0 bg-gradient-to-b from-[#0a0908]/70 via-[#0a0908]/20 to-[#0a0908]/80" />
  </div>
);

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
    // מקור ההגעה נתפס ברגע פתיחת השיחה — הבסיס לדשבורד "אילו מונחים מביאים עבודה"
    const source: Record<string, string> = {};
    try {
      const params = new URLSearchParams(window.location.search);
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "ref"]) {
        const v = params.get(k);
        if (v) source[k] = v.slice(0, 200);
      }
      if (document.referrer) source.referrer = document.referrer.slice(0, 200);
    } catch { /* לא קריטי */ }
    const res = await fetch("/api/public/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, portal: (() => { try { return new URLSearchParams(window.location.search).get("p") ?? ""; } catch { return ""; } })() }),
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
    <div dir="rtl" className="relative flex h-dvh gap-6 bg-[#0a0908] text-[#f4f0e7] lg:px-[10vw] lg:py-6" style={{ fontFamily: "Ploni, Assistant, sans-serif" }}>
      {SCENE_BG}

      {/* חלון הצ'אט — רוחב מלא במובייל; בדסקטופ ממלא את כל השטח שנשאר אחרי עמודת ההמלצות */}
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-[#0a0908]/80 backdrop-blur-[2px] lg:flex-1 lg:rounded-2xl lg:border lg:border-[#272319] lg:shadow-2xl">
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
          m.role === "bot" ? (
            <div key={i} className="flex items-end gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/avatar-tailor.png" alt="" className="h-8 w-8 shrink-0 rounded-full border border-[#4e4227] object-cover" />
              <div className="max-w-[82%] whitespace-pre-line rounded-2xl rounded-br-md bg-[#1a1714] px-4 py-2.5 text-[15px] leading-relaxed shadow">
                {renderText(m.text)}
              </div>
            </div>
          ) : (
            <div key={i} className="mr-auto max-w-[75%] whitespace-pre-line rounded-2xl rounded-bl-md border border-[#4e4227] bg-[#29230f] px-4 py-2 text-[14.5px] text-[#eed89b]">
              {m.text}
            </div>
          )
        ))}

        {/* מחוון הקלדה / התקדמות מחקר */}
        {busy && (
          <div className="flex items-end gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/avatar-tailor.png" alt="" className="h-8 w-8 shrink-0 rounded-full border border-[#4e4227] object-cover" />
          <div className="max-w-[82%] rounded-2xl rounded-br-md bg-[#1a1714] px-4 py-3 text-[13px] text-[#9a9184]">
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

      {/* עמודת המלצות — דסקטופ בלבד, בצד שמאל, 25% מרוחב המסך */}
      <aside className="relative z-10 hidden h-full w-[25vw] flex-col gap-3 overflow-y-auto py-1 lg:flex">
        <div className="mb-1 px-1">
          <div className="text-[11px] tracking-[.2em] text-[#c8ab5e]">לקוחות מספרים</div>
          <div className="text-lg font-semibold text-[#f4f0e7]">למה בעלי עסקים בוחרים ב-Mr.digitailor</div>
        </div>
        {TESTIMONIALS.map((t) => (
          <div key={t.name} className="rounded-xl border border-[#272319] bg-[#131110]/90 p-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.img} alt={t.name} className="h-11 w-11 shrink-0 rounded-full border border-[#4e4227] object-cover" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#f4f0e7]">{t.name}</div>
                <div className="truncate text-xs text-[#7e776a]">{t.biz}</div>
              </div>
              <div className="mr-auto text-[12px] tracking-[.14em] text-[#eed89b]">★★★★★</div>
            </div>
            <p className="mt-3 text-[13.5px] font-light leading-relaxed text-[#b5ad9e]">"{t.quote}"</p>
          </div>
        ))}
      </aside>
    </div>
  );
}
