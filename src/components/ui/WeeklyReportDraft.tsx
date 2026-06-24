"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, Loader2, RefreshCw, Send, Settings2, CheckCircle2, FileText } from "lucide-react";

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

const cardClass = "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";
const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

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

/** ממיר Markdown לטקסט ידידותי לוואטסאפ — בלי #, טבלאות הופכות לשורות, **bold**→*bold* */
function markdownToWhatsApp(md: string): string {
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

export default function WeeklyReportDraft({ clientId, onChanged }: { clientId: string; onChanged?: () => void }) {
  const { data: session } = useSession();
  const userName = (session?.user as { name?: string } | undefined)?.name ?? "";

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DraftReport | null>(null);
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [period, setPeriod] = useState("");
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [note, setNote] = useState("");
  const [approving, setApproving] = useState(false);

  // הגדרות
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [format, setFormat] = useState("standard");
  const [instructions, setInstructions] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

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

  async function approve() {
    if (!report) return;
    setApproving(true);
    try {
      await fetch("/api/reports/trackers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          type: "weekly",
          date: new Date().toISOString().split("T")[0],
          content: report.content,
          author: userName,
        }),
      });
      await load();
      onChanged?.();
    } finally {
      setApproving(false);
    }
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

  if (loading) return <div className={cardClass}><p className="text-sm text-brand-muted">טוען...</p></div>;

  const isSent = report?.status === "sent";

  return (
    <div className="space-y-4">
      {/* כותרת + הגדרות */}
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-gold" />
            <div>
              <h2 className="text-lg font-semibold text-brand-dark">הפקת דוח שבועי</h2>
              <p className="text-xs text-brand-muted">השבוע שחלף {period && `· ${period}`}</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
          >
            <Settings2 className="h-3.5 w-3.5" />
            הגדרות פורמט
          </button>
        </div>

        {settingsOpen && (
          <div className="mt-4 space-y-3 rounded-lg border border-brand-border bg-brand-bg p-4">
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
      </div>

      {/* טיוטת הדוח */}
      <div className={cardClass}>
        {!report ? (
          <div className="py-8 text-center">
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isSent ? "bg-green-100 text-green-700" : "bg-brand-gold/15 text-brand-dark"
                }`}
              >
                {isSent ? "נשלח ✓" : "טיוטה"}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => generate(true)}
                  disabled={generating}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
                  {generating ? "מפיק..." : "צור מחדש"}
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(markdownToWhatsApp(report.content))}
                  className="rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
                  title="מעתיק בפורמט נקי לוואטסאפ (בלי טבלאות שבורות)"
                >
                  העתק לוואטסאפ
                </button>
                {!isSent && (
                  <button
                    onClick={approve}
                    disabled={approving}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-gold/80 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {approving ? "מאשר..." : "אשר ושלח"}
                  </button>
                )}
              </div>
            </div>

            {/* תוכן הדוח (Markdown) */}
            <div className="rounded-lg border border-brand-border bg-brand-bg p-5" dir="rtl">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {report.content}
              </ReactMarkdown>
            </div>

            {/* צ'אט תיקון */}
            <div className="rounded-lg border border-brand-border bg-brand-light p-4">
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
                        m.role === "user"
                          ? "bg-brand-gold/10 text-brand-dark"
                          : "bg-brand-bg text-brand-muted"
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
      </div>
    </div>
  );
}
