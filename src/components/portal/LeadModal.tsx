"use client";

// כרטיס ליד: חמישה טאבים. השיחה המלאה, פרטי הליד, הדוח שקיבל,
// ניוזלטר ומד השלמת המשפך, ותיעוד ומשימות (משימת המשך + הערות ושיחות).
import { useCallback, useEffect, useState } from "react";
import { Calendar, ExternalLink, X, Loader2, MailOpen, MousePointerClick, Check, BadgeCheck, Mail, MessageCircle, Clock, Trash2, UserX, CalendarCheck } from "lucide-react";
import {
  type Row, type Detail, type LeadNote, type DealSeed,
  EMAIL_LABELS, NOTE_KINDS, noteLabel, cardCls, inputCls, goldBtn, ghostBtn,
  fmtFull, isDue, toLocalInput, waLink, portalApi,
} from "./shared";

type DetailTab = "chat" | "info" | "report" | "newsletter" | "log";
const TABS: Array<[DetailTab, string]> = [
  ["chat", "השיחה המלאה"], ["info", "פרטי הליד"], ["report", "הדוח שקיבל"], ["newsletter", "ניוזלטר ומשפך"], ["log", "תיעוד ומשימות"],
];

export default function LeadModal({ token, row, onClose, onRowChange, onCloseDeal }: {
  token: string; row: Row; onClose: () => void;
  onRowChange: (patch: Partial<Row>) => void;   // מעדכן את השורה בטבלה בלי לטעון מחדש
  onCloseDeal: (seed: DealSeed) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("chat");
  const [savingStatus, setSavingStatus] = useState(false);
  // משימת המשך
  const [actionAt, setActionAt] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  // תיעוד חדש
  const [noteKind, setNoteKind] = useState("note");
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [openedAt] = useState(() => Date.now()); // "עכשיו" קבוע לכל חיי החלון
  // מה קרה בפגישה (התקיימה / לא הגיע): אישור בשני שלבים, כי הסימון שולח מייל לליד
  const [noShow, setNoShow] = useState<"idle" | "confirm" | "busy" | "done" | "failed">("idle");
  const [markKind, setMarkKind] = useState<"noShow" | "meetingHeld">("noShow");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await portalApi<Detail>(token, { query: `id=${encodeURIComponent(row.id)}` });
    if (res.ok) {
      setDetail(res.data);
      setActionAt(toLocalInput(res.data.nextActionAt));
      setActionNote(res.data.nextActionNote ?? "");
    }
    setLoading(false);
  }, [token, row.id]);
  useEffect(() => { load(); }, [load]);

  const f = detail?.fields ?? {};
  const phone = String(f.phone ?? row.phone ?? "");
  const email = String(f.email ?? row.email ?? "");
  const wa = waLink(phone);
  const seed: DealSeed = {
    chatId: row.id, name: String(f.name ?? row.name ?? "") || "ללא שם",
    business: String(f.businessName ?? f.serviceField ?? row.business ?? ""), phone, email,
  };
  const isCustomer = Boolean(detail?.customerId ?? row.customerId);

  const saveStatus = async (status: string) => {
    if (!detail) return;
    // "נסגר" עובר דרך טופס סגירת העסקה, כדי שנדע בכמה
    if (status === "נסגר" && !isCustomer) { onCloseDeal(seed); return; }
    setSavingStatus(true);
    const res = await portalApi(token, { method: "PATCH", body: { id: detail.id, funnelStatus: status } });
    if (res.ok) { setDetail({ ...detail, funnelStatus: status }); onRowChange({ manualStatus: status, status: status || row.status }); }
    setSavingStatus(false);
  };

  const saveAction = async (clear = false) => {
    if (!detail) return;
    setSavingAction(true);
    const at = clear || !actionAt ? "" : new Date(actionAt).toISOString();
    const res = await portalApi(token, { method: "PATCH", body: { kind: "nextAction", id: detail.id, at, note: actionNote } });
    if (res.ok) {
      const next = { nextActionAt: at || null, nextActionNote: at ? actionNote : "" };
      setDetail({ ...detail, ...next }); onRowChange(next);
      if (!at) { setActionAt(""); setActionNote(""); }
    }
    setSavingAction(false);
  };

  const rep0 = detail?.report;
  const meetingPassed = Boolean(rep0?.meetingAt && !rep0.cancelledAt && new Date(rep0.meetingAt).getTime() < openedAt);
  const alreadyNoShow = Boolean(rep0?.noShowAt && rep0.meetingAt && new Date(rep0.noShowAt) > new Date(rep0.meetingAt));
  const alreadyHeld = Boolean(rep0?.meetingHeldAt && rep0.meetingAt && new Date(rep0.meetingHeldAt) > new Date(rep0.meetingAt));
  const canMarkNoShow = meetingPassed && !alreadyNoShow && !alreadyHeld && !isCustomer;
  const held = markKind === "meetingHeld";

  const markNoShow = async () => {
    if (!detail?.report) return;
    setNoShow("busy");
    const res = await portalApi<{ emailed?: boolean }>(token, { method: "PATCH", body: { kind: markKind, id: detail.id } });
    if (!res.ok) { setNoShow("failed"); return; }
    const nowIso = new Date().toISOString();
    setDetail({ ...detail, report: { ...detail.report, ...(held ? { meetingHeldAt: nowIso } : { noShowAt: nowIso }) } });
    onRowChange({ meetingPending: false, ...(detail.funnelStatus ? {} : { status: held ? "הפגישה התקיימה" : "לא הגיע לפגישה" }) });
    setNoShow("done");
  };

  const addNote = async () => {
    if (!detail || !noteText.trim()) return;
    setSavingNote(true);
    const res = await portalApi<{ note?: LeadNote }>(token, { method: "POST", body: { kind: "note", chatId: detail.id, noteKind, text: noteText } });
    if (res.ok && res.data.note) { setDetail({ ...detail, notes: [res.data.note, ...detail.notes] }); setNoteText(""); }
    setSavingNote(false);
  };

  const removeNote = async (id: string) => {
    if (!detail) return;
    setDetail({ ...detail, notes: detail.notes.filter((n) => n.id !== id) });
    await portalApi(token, { method: "PATCH", body: { kind: "note", id } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 lg:p-8" onClick={onClose}>
      <div dir="rtl" className="flex h-full max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0d0c0a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* כותרת + פעולות */}
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{String(f.name ?? row.name ?? "") || "אנונימי"}</h2>
            <p className="text-sm text-white/50">{String(f.businessName ?? f.serviceField ?? row.business ?? "")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {wa && <a href={wa} target="_blank" rel="noreferrer" className={ghostBtn}><MessageCircle className="h-4 w-4 text-emerald-300" /> וואטסאפ</a>}
            {email && <a href={`mailto:${email}`} className={ghostBtn}><Mail className="h-4 w-4 text-sky-300" /> מייל</a>}
            {canMarkNoShow && noShow === "idle" && (
              <>
                <button onClick={() => { setMarkKind("meetingHeld"); setNoShow("confirm"); }} className={ghostBtn}><CalendarCheck className="h-4 w-4 text-emerald-300" /> הפגישה התקיימה</button>
                <button onClick={() => { setMarkKind("noShow"); setNoShow("confirm"); }} className={ghostBtn}><UserX className="h-4 w-4 text-red-300" /> לא הגיע לפגישה</button>
              </>
            )}
            {isCustomer
              ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400/15 px-3 py-1.5 text-sm font-medium text-emerald-300"><BadgeCheck className="h-4 w-4" /> לקוח</span>
              : <button onClick={() => onCloseDeal(seed)} className={goldBtn}><BadgeCheck className="h-4 w-4" /> סגירת עסקה</button>}
            <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {noShow !== "idle" && (
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-white/[0.03] px-5 py-3 text-sm">
            {noShow === "confirm" && (
              <>
                <span className="text-white/80">{held
                  ? "לסמן שהפגישה התקיימה? יישלח אליו עכשיו מייל סיכום, ועוד שני מיילים בשבוע הקרוב אם העסקה לא תיסגר."
                  : "לסמן שהליד לא הגיע? יישלח אליו מייל עם הזמנה לבחור מועד חדש."}</span>
                <button onClick={markNoShow} className={goldBtn}>כן, לסמן ולשלוח</button>
                <button onClick={() => setNoShow("idle")} className="text-white/50 hover:text-white">ביטול</button>
              </>
            )}
            {noShow === "busy" && <span className="inline-flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> מסמן ושולח...</span>}
            {noShow === "done" && <span className="inline-flex items-center gap-1.5 text-emerald-300"><Check className="h-4 w-4" /> {held ? "סומן שהפגישה התקיימה, ונשלח אליו מייל סיכום." : "סומן שלא הגיע, ונשלח אליו מייל לבחירת מועד חדש."}</span>}
            {noShow === "failed" && <span className="text-red-300">הסימון נכשל. נסו שוב בעוד רגע.</span>}
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 pt-2">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm transition-colors duration-200 ${tab === key ? "border-b-2 border-brand-gold font-medium text-brand-gold" : "text-white/50 hover:text-white"}`}>
              {label}{key === "log" && detail && isDue(detail.nextActionAt) ? " •" : ""}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading && <div className="flex h-40 items-center justify-center text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>}

          {detail && tab === "chat" && (
            <div className="space-y-2">
              {detail.transcript.length === 0 && <div className="py-10 text-center text-white/40">אין עדיין הודעות בשיחה</div>}
              {detail.transcript.map((m, i) => (
                <div key={i} className={m.role === "assistant"
                  ? "max-w-[85%] whitespace-pre-line rounded-xl rounded-tr-sm bg-white/[0.07] px-3 py-2 text-[13.5px] text-white/85"
                  : "mr-auto max-w-[85%] whitespace-pre-line rounded-xl rounded-tl-sm border border-brand-gold/25 bg-brand-gold/10 px-3 py-2 text-[13.5px] text-brand-gold"}>
                  {m.text}
                  {m.at && <div className="mt-1 text-[10px] text-white/30">{fmtFull(m.at)}</div>}
                </div>
              ))}
            </div>
          )}

          {detail && tab === "info" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-white/50">סטטוס:</span>
                <select value={detail.funnelStatus} onChange={(e) => saveStatus(e.target.value)} disabled={savingStatus} className={inputCls}>
                  <option value="" className="bg-black">אוטומטי</option>
                  {detail.statusOptions.map((s) => <option key={s} value={s} className="bg-black">{s}</option>)}
                </select>
                {savingStatus && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
              </div>
              <div className={`grid grid-cols-2 gap-x-4 gap-y-2.5 ${cardCls} p-4 text-sm`}>
                {[
                  ["שם", String(f.name ?? "")],
                  ["עסק / תחום", String(f.businessName ?? f.serviceField ?? "")],
                  ["מייל", email], ["טלפון", phone],
                  ["אזור שירות", String(f.serviceArea ?? "")],
                  ["תקציב פרסום", f.budget ? `${Number(f.budget).toLocaleString("he-IL")} ₪ לחודש` : ""],
                  ["שווי עסקה", f.dealFirst ? `${Number(f.dealFirst).toLocaleString("he-IL")} ₪` : ""],
                  ["נכנס לשיחה", fmtFull(detail.createdAt)],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><div className="text-xs text-white/40">{k}</div><div className="text-white/90">{v}</div></div>
                ))}
                {Boolean(f.declineReason) && (
                  <div className="col-span-2"><div className="text-xs text-white/40">סיבת סירוב לפגישה</div><div className="font-medium text-amber-300">{String(f.declineReason)}</div></div>
                )}
              </div>
              {Object.keys(detail.source ?? {}).length > 0 && (
                <div className="rounded-xl border border-white/10 p-4 text-sm">
                  <div className="mb-2 font-medium text-white/80">מקור ההגעה</div>
                  <div className="grid grid-cols-2 gap-y-1.5">
                    {Object.entries(detail.source).map(([k, v]) => (
                      <div key={k} className="text-xs text-white/50"><span className="font-mono text-white/35">{k}</span>: {v}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {detail && tab === "report" && (
            <div className="flex h-full flex-col gap-3">
              {!detail.report && <div className="py-10 text-center text-white/40">הליד עוד לא הגיע לשלב הדוח</div>}
              {detail.report && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {detail.report.headline && <div className="text-lg font-semibold text-brand-gold">{detail.report.headline}</div>}
                      {detail.report.meetingAt && !detail.report.cancelledAt && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-sm text-emerald-300"><Calendar className="h-4 w-4" /> פגישה: {fmtFull(detail.report.meetingAt)}</div>
                      )}
                      {detail.report.cancelledAt && <div className="mt-0.5 text-sm text-red-300">הפגישה בוטלה</div>}
                      {alreadyNoShow && <div className="mt-0.5 text-sm text-red-300">לא הגיע לפגישה</div>}
                      {alreadyHeld && <div className="mt-0.5 text-sm text-sky-300">הפגישה התקיימה</div>}
                    </div>
                    {detail.report.link && (
                      <a href={detail.report.link} target="_blank" rel="noreferrer" className={ghostBtn}>פתיחה בחלון מלא <ExternalLink className="h-3.5 w-3.5" /></a>
                    )}
                  </div>
                  {detail.report.link
                    ? <iframe src={detail.report.link} className="min-h-0 w-full flex-1 rounded-xl border border-white/10 bg-black" title="הדוח שהליד קיבל" />
                    : <div className={`${cardCls} px-6 py-10 text-center text-sm text-white/45`}>בסביבת ההדגמה הדוח המלא לא מוצג. אצל ליד אמיתי הדוח הממותג נפתח כאן.</div>}
                </>
              )}
            </div>
          )}

          {detail && tab === "newsletter" && <FunnelProgress detail={detail} now={openedAt} />}

          {detail && tab === "log" && (
            <div className="space-y-5">
              {/* משימת המשך */}
              <div className={`${cardCls} p-4`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white/80">
                  <Clock className="h-4 w-4 text-brand-gold" /> הצעד הבא
                  {isDue(detail.nextActionAt) && <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[11px] font-semibold text-black">הגיע הזמן</span>}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-white/50">מתי</label>
                    <input type="datetime-local" value={actionAt} onChange={(e) => setActionAt(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1 block text-xs text-white/50">מה צריך לעשות</label>
                    <input value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="להתקשר, לשלוח הצעת מחיר..." className={`${inputCls} w-full`} />
                  </div>
                  <button onClick={() => saveAction()} disabled={savingAction || !actionAt} className={goldBtn}>
                    {savingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירה"}
                  </button>
                  {detail.nextActionAt && <button onClick={() => saveAction(true)} disabled={savingAction} className={ghostBtn}><Check className="h-4 w-4" /> בוצע</button>}
                </div>
              </div>

              {/* תיעוד */}
              <div className={`${cardCls} p-4`}>
                <div className="mb-3 text-sm font-medium text-white/80">תיעוד</div>
                <div className="flex flex-wrap items-start gap-2">
                  <select value={noteKind} onChange={(e) => setNoteKind(e.target.value)} className={inputCls} aria-label="סוג התיעוד">
                    {NOTE_KINDS.map((n) => <option key={n.value} value={n.value} className="bg-black">{n.label}</option>)}
                  </select>
                  <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="מה היה, מה סוכם..."
                    className={`${inputCls} min-w-[220px] flex-1 resize-none`} />
                  <button onClick={addNote} disabled={savingNote || !noteText.trim()} className={goldBtn}>
                    {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "הוספה"}
                  </button>
                </div>
                <div className="mt-4 space-y-2.5">
                  {detail.notes.length === 0 && <div className="py-3 text-center text-xs text-white/40">עוד אין תיעוד על הליד הזה</div>}
                  {detail.notes.map((n) => (
                    <div key={n.id} className="group flex items-start gap-3 rounded-lg border border-white/10 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-white/40"><span className="text-brand-gold">{noteLabel(n.kind)}</span> · {fmtFull(n.createdAt)}</div>
                        <div className="mt-0.5 whitespace-pre-line text-sm text-white/85">{n.text}</div>
                      </div>
                      <button onClick={() => removeNote(n.id)} title="הסרה" aria-label="הסרת התיעוד"
                        className="rounded p-1 text-white/25 opacity-0 transition-opacity duration-200 hover:text-red-300 group-hover:opacity-100">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** מד השלמת המשפך + המיילים שהליד קיבל */
function FunnelProgress({ detail, now }: { detail: Detail; now: number }) {
  const emailOpened = detail.emails.some((e) => e.openedAt);
  const emailClicked = detail.emails.some((e) => e.clickedAt);
  const hasContact = Boolean(detail.fields.email || detail.fields.phone);
  const hasMeeting = Boolean(detail.report?.meetingAt && !detail.report?.cancelledAt);
  const meetingDone = hasMeeting && new Date(String(detail.report!.meetingAt)).getTime() < now;
  const isHot = detail.funnelStatus === "חם";
  const closed = detail.funnelStatus === "נסגר" || Boolean(detail.customerId);
  const steps = [
    { label: "נכנס לשיחה", pct: 5, done: true },
    { label: "השאיר פרטים", pct: 25, done: hasContact },
    { label: "קיבל דוח", pct: 35, done: Boolean(detail.report) },
    { label: "פתח מייל", pct: 45, done: emailOpened },
    { label: "הקליק בקישור", pct: 55, done: emailClicked },
    { label: "קבע פגישה", pct: 70, done: hasMeeting || closed },
    { label: "פגישה התקיימה", pct: 80, done: meetingDone || closed },
    { label: "ליד חם / הצעת מחיר", pct: 90, done: isHot || closed },
    { label: "נסגר לעסקה", pct: 100, done: closed },
  ];
  const progress = Math.max(...steps.filter((s) => s.done).map((s) => s.pct), 0);

  return (
    <div className="space-y-5">
      <div className={`${cardCls} p-4`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-white/80">השלמת המשפך</span>
          <span className="text-xl font-semibold text-brand-gold">{progress}%</span>
        </div>
        <progress value={progress} max={100} className="h-2.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-gold [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand-gold" />
        <div className="mt-4 grid gap-1.5 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.label} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${s.done ? "bg-brand-gold/10 text-brand-gold" : "text-white/35"}`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-brand-gold text-black" : "border border-white/20"}`}>
                {s.done && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1">{s.label}</span>
              <span className="font-mono text-[10px] opacity-70">{s.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 p-4 text-sm">
        <div className="mb-2 font-medium text-white/80">המיילים שקיבל</div>
        {detail.emails.length === 0 && <div className="py-4 text-center text-xs text-white/40">עוד לא נשלחו מיילים לליד הזה</div>}
        <div className="space-y-2.5">
          {detail.emails.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-white/70">{EMAIL_LABELS[e.key] ?? e.key}</span>
              <span className="flex items-center gap-2 text-white/40">
                {fmtFull(e.sentAt)}
                {e.bouncedAt ? <span className="text-red-300">נדחה</span>
                  : e.clickedAt ? <span className="inline-flex items-center gap-1 text-sky-300"><MousePointerClick className="h-3 w-3" /> הקליק בקישור</span>
                  : e.openedAt ? <span className="inline-flex items-center gap-1 text-emerald-300"><MailOpen className="h-3 w-3" /> נפתח</span>
                  : <span>נשלח</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
