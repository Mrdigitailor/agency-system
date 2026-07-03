"use client";

// כרטיס הדוח השבועי — הכל במקום אחד: תקופה + סטטוס, שורת פעולות אחת,
// תוכן הדוח, וצ'אט תיקונים. בלי כרטיסים כפולים ובלי סטטוס כפול.

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, Loader2, RefreshCw, Send, Settings2, FileText, Mail, Copy, CheckCircle2 } from "lucide-react";
import Modal from "@/components/ui/Modal";

interface ReportMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}
interface DraftReport {
  id: string;
  content: string;
  status: string;
  weekStart: string;
  weekEnd: string;
}
/** פרטי שליחה מהשבוע הנוכחי (מגיעים מהרשימה שההורה טוען) */
export interface SentInfo {
  sentAt: string;
  by: string;
}

const cardClass = "rounded-lg border border-brand-border bg-brand-light shadow-sm";
const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";
const toolbarBtn =
  "flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark disabled:opacity-50";

// מיפוי אלמנטים של Markdown לסגנון המותג (RTL)
const mdComponents = {
  h1: (p: object) => <h1 className="mb-2 text-lg font-bold text-brand-dark" {...p} />,
  h2: (p: object) => <h2 className="mb-1 mt-4 text-base font-semibold text-brand-dark" {...p} />,
  h3: (p: object) => <h3 className="mb-1 mt-3 text-sm font-semibold text-brand-dark" {...p} />,
  p: (p: object) => <p className="my-2 text-sm leading-relaxed text-brand-dark" {...p} />,
  ul: (p: object) => <ul className="my-2 list-disc space-y-1 pr-5 text-sm text-brand-dark" {...p} />,
  ol: (p: object) => <ol className="my-2 list-decimal space-y-1 pr-5 text-sm text-brand-dark" {...p} />,
  li: (p: object) => <li className="leading-relaxed text-brand-dark" {...p} />,
  strong: (p: object) => <strong className="font-semibold text-brand-dark" {...p} />,
  table: (p: object) => <table className="my-2 w-full border-collapse text-xs" {...p} />,
  th: (p: object) => <th className="border border-brand-border bg-brand-bg px-2 py-1 text-right font-medium" {...p} />,
  td: (p: object) => <td className="border border-brand-border px-2 py-1 text-right" {...p} />,
  hr: () => <hr className="my-3 border-brand-border" />,
};

function formatPeriod(s: string, e: string): string {
  if (!s || !e) return "";
  const f = (d: string) => new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  return `${f(s)} – ${f(e)}`;
}

function formatDateHe(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** ממיר Markdown לטקסט ידידותי לוואטסאפ — בלי #, טבלאות הופכות לשורות, **bold**→*bold* */
export function markdownToWhatsApp(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      // שורת מפריד טבלה (|---|---|) — להסיר
      if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) return null;
      // שורת טבלה רגילה — להפוך לתאים מופרדים
      if (/^\s*\|.*\|\s*$/.test(line)) {
        const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
        return cells.length === 2 ? `${cells[0]}: ${cells[1]}` : cells.join(" · ");
      }
      return line;
    })
    .filter((l) => l !== null)
    .join("\n")
    .replace(/^#{1,6}\s*(.+)$/gm, "*$1*") // כותרות → bold
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // **bold** → *bold*
    .replace(/^\s*[-*]\s+/gm, "• ") // תבליטים → •
    .replace(/^\s*---\s*$/gm, "") // קווי הפרדה
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function WeeklyReportDraft({
  clientId,
  onChanged,
  sentInfo,
}: {
  clientId: string;
  onChanged?: () => void;
  sentInfo?: SentInfo | null;
}) {
  const { data: session } = useSession();
  const userName = (session?.user as { name?: string } | undefined)?.name ?? "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canMark = userRole === "admin" || userRole === "manager" || userRole === "campaignManager";

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DraftReport | null>(null);
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [period, setPeriod] = useState("");
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // הגדרות פורמט (מוסתרות מאחורי גלגל שיניים)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [format, setFormat] = useState("standard");
  const [instructions, setInstructions] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // סימון כנשלח (לדוחות שנשלחו בוואטסאפ) — נפתח עם הטיוטה מולאה מראש
  const [markModal, setMarkModal] = useState(false);
  const [markContent, setMarkContent] = useState("");
  const [markSaving, setMarkSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [curRes, profRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/weekly-report/current`),
        fetch(`/api/clients/${clientId}/profile`),
      ]);
      const cur = await curRes.json();
      setReport(cur.report ?? null);
      setMessages(cur.messages ?? []);
      setPeriod(formatPeriod(cur.weekStart, cur.weekEnd));
      if (profRes.ok) {
        const prof = await profRes.json();
        setFormat(prof.weeklyReportFormat ?? "standard");
        setInstructions(prof.weeklyReportInstructions ?? "");
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate(force = false) {
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/weekly-report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (res.ok) {
        await load();
        onChanged?.();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function sendRefine() {
    if (!report || !note.trim()) return;
    setRefining(true);
    const text = note.trim();
    setNote("");
    try {
      const res = await fetch(`/api/clients/${clientId}/weekly-report/${report.id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setReport((r) => (r ? { ...r, content: data.content } : r));
        setMessages(data.messages ?? []);
      }
    } finally {
      setRefining(false);
    }
  }

  async function sendToClient() {
    if (!report) return;
    if (!confirm("לשלוח את הדוח במייל ללקוח? הוא יסומן כנשלח לשבוע זה.")) return;
    setSending(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/weekly-report/${report.id}/send`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ הדוח נשלח ל-${data.sentTo}`);
        await load();
        onChanged?.();
      } else {
        alert(`שליחה נכשלה: ${data.error ?? "שגיאה"}`);
      }
    } finally {
      setSending(false);
    }
  }

  function copyToWhatsApp() {
    if (!report) return;
    navigator.clipboard.writeText(markdownToWhatsApp(report.content));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function openMarkModal() {
    // מולא מראש מהטיוטה הקיימת בפורמט וואטסאפ — רק לאשר
    setMarkContent(report ? markdownToWhatsApp(report.content) : "");
    setMarkModal(true);
  }

  async function handleMarkAsSent() {
    if (!markContent.trim()) return;
    setMarkSaving(true);
    const today = new Date().toISOString().split("T")[0];
    await fetch("/api/reports/trackers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, type: "weekly", date: today, content: markContent.trim(), author: userName }),
    });
    setMarkSaving(false);
    setMarkModal(false);
    setMarkContent("");
    onChanged?.();
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await fetch(`/api/clients/${clientId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyReportFormat: format, weeklyReportInstructions: instructions }),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) return <div className={`${cardClass} p-6`}><p className="text-sm text-brand-muted">טוען...</p></div>;

  // סטטוס אחד ומאוחד: נשלח (מייל/וואטסאפ) > טיוטה > טרם הופק
  const isSent = report?.status === "sent" || !!sentInfo;

  return (
    <div className={cardClass}>
      {/* ===== שורת כותרת: תקופה + סטטוס אחד ברור ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-brand-gold" />
          <div>
            <h2 className="text-base font-semibold text-brand-dark">דוח שבועי {period && `· ${period}`}</h2>
            {isSent && sentInfo && (
              <p className="text-xs text-brand-muted">נשלח ב-{formatDateHe(sentInfo.sentAt)}{sentInfo.by ? ` על ידי ${sentInfo.by}` : ""}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSent ? (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />נשלח
            </span>
          ) : report ? (
            <span className="rounded-full bg-brand-gold/15 px-3 py-1 text-xs font-medium text-brand-dark">טיוטה — טרם נשלח</span>
          ) : (
            <span className="rounded-full bg-brand-bg px-3 py-1 text-xs font-medium text-brand-muted">טרם הופק</span>
          )}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title="הגדרות פורמט הדוח"
            className={`rounded-lg border p-1.5 transition-colors duration-200 ${settingsOpen ? "border-brand-gold bg-brand-gold/10 text-brand-dark" : "border-brand-border text-brand-muted hover:bg-brand-bg hover:text-brand-dark"}`}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ===== פאנל הגדרות (נפתח רק בלחיצה על גלגל השיניים) ===== */}
      {settingsOpen && (
        <div className="space-y-3 border-b border-brand-border bg-brand-bg px-6 py-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-brand-muted">פורמט הדוח</p>
            <div className="flex gap-2">
              {[
                { v: "standard", label: "סטנדרטי" },
                { v: "per_product", label: "פר מוצר" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setFormat(opt.v)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    format === opt.v
                      ? "border-brand-gold bg-brand-gold/15 text-brand-dark"
                      : "border-brand-border bg-brand-light text-brand-muted hover:bg-brand-bg"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {format === "per_product" && (
              <p className="mt-1.5 text-[11px] text-brand-muted">
                הקמפיינים יקובצו למוצרים לפי שם הקמפיין (קמפיין ששמו מכיל את שם המוצר).
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-brand-muted">הוראות חופשיות ל-AI (אופציונלי)</p>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              dir="rtl"
              className={inputClass}
              placeholder="לדוגמה: הדגש ROAS, טון פורמלי, התמקד בלידים..."
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            {settingsSaved && <span className="text-xs text-brand-success">נשמר ✓</span>}
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="rounded-lg bg-brand-gold px-4 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
            >
              {savingSettings ? "שומר..." : "שמור הגדרות"}
            </button>
          </div>
        </div>
      )}

      {/* ===== גוף הכרטיס ===== */}
      {!report ? (
        <div className="px-6 py-10 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-brand-muted/40" />
          <p className="mb-4 text-sm text-brand-muted">טרם הופק דוח לשבוע זה.</p>
          <button
            onClick={() => generate(false)}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "מפיק דוח..." : "צור דוח עכשיו"}
          </button>
        </div>
      ) : (
        <div className="space-y-4 px-6 py-4">
          {/* שורת פעולות אחת — הכל כאן */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={sendToClient}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3.5 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {sending ? "שולח..." : isSent ? "שלח שוב במייל" : "שלח במייל"}
            </button>
            <button onClick={copyToWhatsApp} className={toolbarBtn} title="מעתיק בפורמט נקי לוואטסאפ">
              <Copy className="h-3.5 w-3.5" />
              {copied ? "הועתק ✓" : "העתק לוואטסאפ"}
            </button>
            {canMark && !isSent && (
              <button onClick={openMarkModal} className={toolbarBtn} title="שלחת בוואטסאפ? סמן שהדוח נשלח">
                <CheckCircle2 className="h-3.5 w-3.5" />
                סמן כנשלח
              </button>
            )}
            <div className="flex-1" />
            <button onClick={() => generate(true)} disabled={generating} className={toolbarBtn}>
              <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
              {generating ? "מפיק..." : "צור מחדש"}
            </button>
          </div>

          {/* תוכן הדוח (Markdown) */}
          <div className="rounded-lg border border-brand-border bg-brand-bg p-5" dir="rtl">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {report.content}
            </ReactMarkdown>
          </div>

          {/* צ'אט תיקון */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-muted">
              <Sparkles className="h-3.5 w-3.5 text-brand-gold" />
              שלח הערה לתיקון הדוח
            </p>
            {messages.length > 0 && (
              <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-xs ${
                      m.role === "user" ? "bg-brand-gold/10 text-brand-dark" : "bg-brand-bg text-brand-muted"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendRefine();
                  }
                }}
                rows={2}
                dir="rtl"
                disabled={refining}
                className={inputClass}
                placeholder="לדוגמה: קצר יותר, הוסף השוואה לשבוע שעבר, הדגש את הלידים..."
              />
              <button
                onClick={sendRefine}
                disabled={refining || !note.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
              >
                {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* מודל סימון כנשלח — מולא מראש מהטיוטה */}
      <Modal isOpen={markModal} onClose={() => setMarkModal(false)} title={`סימון דוח שבועי כנשלח ${period && `— ${period}`}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-brand-muted">
            {report ? "התוכן מולא מהטיוטה הקיימת — ערוך אם צריך ואשר." : "הזן את הסיכום ששלחת ללקוח."}
          </p>
          <textarea
            value={markContent}
            onChange={(e) => setMarkContent(e.target.value)}
            rows={10}
            className={inputClass}
            placeholder="הדבק כאן את תוכן הדוח..."
            dir="rtl"
          />
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button onClick={() => setMarkModal(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-muted hover:bg-brand-bg">
              ביטול
            </button>
            <button
              onClick={handleMarkAsSent}
              disabled={!markContent.trim() || markSaving}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
            >
              {markSaving ? "שומר..." : "שמור וסמן כנשלח"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
