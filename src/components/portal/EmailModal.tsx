"use client";

// כרטיס מייל: עריכת הנוסח עם תצוגה מקדימה חיה, המלצות לשיפור שאפשר להחיל בלחיצה,
// והשוואת המספרים בין הגרסאות (לפני ואחרי כל שינוי).
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, Sparkles, RotateCcw, ArrowUp, ArrowDown, Check } from "lucide-react";
import {
  type MailingDetail, type EmailFields, type EmailFieldKey, type EmailAdvice, type EmailVersionRow,
  EMAIL_FIELD_LABELS, cardCls, inputCls, goldBtn, ghostBtn, fmtFull, pct, portalApi,
} from "./shared";

type ModalTab = "edit" | "advice" | "versions";
const TABS: Array<[ModalTab, string]> = [["edit", "עריכה"], ["advice", "המלצות לשיפור"], ["versions", "לפני ואחרי"]];
const FIELD_ORDER: EmailFieldKey[] = ["subject", "preheader", "bodyBefore", "bodyAfter", "buttonLabel", "footnote"];
const LONG_FIELDS: EmailFieldKey[] = ["bodyBefore", "bodyAfter"];
const HINTS: Partial<Record<EmailFieldKey, string>> = {
  preheader: "השורה שמופיעה ליד הנושא בתיבת הדואר, לפני שפותחים את המייל",
  bodyBefore: "שורה ריקה פותחת פסקה חדשה. **טקסט** בין כוכביות יוצא מודגש",
  footnote: "שורה קטנה אחרי הכפתור. אפשר להשאיר ריק",
};

/** ההפרש בנקודות אחוז בין גרסה לקודמת לה */
function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null) return null;
  const d = Math.round(now - before);
  if (d === 0) return null;
  const up = d > 0;
  return (
    <span className={`mr-1.5 inline-flex items-center text-[11px] ${up ? "text-emerald-300" : "text-red-300"}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(d)}
    </span>
  );
}

export default function EmailModal({ token, emailKey, demo, onClose, onSaved }: {
  token: string; emailKey: string; demo: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [detail, setDetail] = useState<MailingDetail | null>(null);
  const [tab, setTab] = useState<ModalTab>("edit");
  const [draft, setDraft] = useState<EmailFields | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [advising, setAdvising] = useState(false);
  const [adviceMsg, setAdviceMsg] = useState("");
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await portalApi<MailingDetail>(token, { query: `view=mailing&key=${emailKey}` });
    if (res.ok) { setDetail(res.data); setDraft(res.data.fields); setChangeNote(""); }
  }, [token, emailKey]);
  useEffect(() => { load(); }, [load]);

  // תצוגה מקדימה חיה: מתעדכנת זמן קצר אחרי שמפסיקים להקליד
  useEffect(() => {
    if (!draft) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      const res = await portalApi<{ subject?: string; html?: string }>(token, { method: "POST", body: { kind: "emailPreview", key: emailKey, fields: draft } });
      if (res.ok) setPreview({ subject: res.data.subject ?? "", html: res.data.html ?? "" });
    }, 500);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [draft, token, emailKey]);

  const dirty = Boolean(detail && draft && FIELD_ORDER.some((k) => draft[k] !== detail.fields[k]));
  const set = (k: EmailFieldKey, v: string) => { setDraft((d) => (d ? { ...d, [k]: v } : d)); setMessage(""); };

  const save = async () => {
    if (!draft || !dirty) return;
    setSaving(true); setMessage("");
    const res = await portalApi<{ version?: number; demo?: boolean; error?: string }>(token, {
      method: "POST", body: { kind: "emailVersion", key: emailKey, fields: draft, changeNote },
    });
    setSaving(false);
    if (!res.ok) { setMessage(res.data.error ?? "השמירה נכשלה, נסו שוב"); return; }
    if (res.data.demo) { setMessage("בסביבת ההדגמה שינויים לא נשמרים. במערכת אמיתית זה היה נשמר כגרסה חדשה."); return; }
    setMessage(`נשמר כגרסה ${res.data.version}. מיילים שיישלחו מעכשיו ייצאו בנוסח החדש.`);
    await load(); onSaved();
  };

  const requestAdvice = async () => {
    setAdvising(true); setAdviceMsg("");
    const res = await portalApi<{ items?: EmailAdvice[]; error?: string }>(token, { method: "POST", body: { kind: "emailAdvice", key: emailKey } });
    setAdvising(false);
    if (!res.ok) { setAdviceMsg(res.data.error ?? "הפקת ההמלצות נכשלה"); return; }
    if (!res.data.items?.length) { setAdviceMsg("אין כרגע המלצות למייל הזה."); return; }
    if (demo) setDetail((d) => (d ? { ...d, advice: { items: res.data.items!, createdAt: new Date().toISOString(), version: d.version }, canAdvise: false } : d));
    else await load();
  };

  const apply = (a: EmailAdvice) => {
    set(a.field, a.suggestion);
    setChangeNote(a.title);
    setTab("edit");
  };

  const versionsAsc = detail ? [...detail.versions].reverse() : [];
  const prevOf = (v: EmailVersionRow) => versionsAsc[versionsAsc.findIndex((x) => x.version === v.version) - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 lg:p-6" onClick={onClose}>
      <div dir="rtl" className="flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0d0c0a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-white/10 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">{detail?.label ?? "מייל"}</h2>
            {detail && <p className="mt-0.5 text-sm text-white/50">{detail.when} · גרסה {detail.version}</p>}
          </div>
          <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex gap-1 border-b border-white/10 px-3 pt-2">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm transition-colors duration-200 ${tab === key ? "border-b-2 border-brand-gold font-medium text-brand-gold" : "text-white/50 hover:text-white"}`}>
              {label}{key === "advice" && detail?.advice?.items.length ? ` (${detail.advice.items.length})` : ""}
            </button>
          ))}
        </div>

        {!detail || !draft ? (
          <div className="flex flex-1 items-center justify-center text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* ===== עריכה ===== */}
            {tab === "edit" && (
              <div className="grid min-h-full gap-0 lg:grid-cols-2">
                <div className="space-y-4 p-5">
                  <div className={`${cardCls} px-4 py-3`}>
                    <div className="text-xs text-white/40">התפקיד של המייל</div>
                    <div className="mt-0.5 text-sm leading-relaxed text-white/85">{detail.job}</div>
                  </div>

                  {FIELD_ORDER.map((k) => (
                    <div key={k}>
                      {k === "bodyAfter" && detail.hasBlock && (
                        <div className="mb-3 rounded-lg border border-dashed border-brand-gold/30 bg-brand-gold/5 px-3 py-2 text-xs text-brand-gold/80">
                          כאן מופיעה {detail.blockLabel}. היא קבועה ומתמלאת אוטומטית לכל ליד.
                        </div>
                      )}
                      <label className="mb-1 flex items-center justify-between text-xs text-white/50" htmlFor={`email-${k}`}>
                        <span>{EMAIL_FIELD_LABELS[k]}{k === "bodyAfter" && detail.hasBlock ? ` (אחרי ${detail.blockLabel})` : ""}</span>
                        {draft[k] !== detail.fields[k] && <span className="text-brand-gold">שונה</span>}
                      </label>
                      {LONG_FIELDS.includes(k)
                        ? <textarea id={`email-${k}`} rows={k === "bodyBefore" ? 7 : 4} value={draft[k]} onChange={(e) => set(k, e.target.value)} className={`${inputCls} w-full resize-y leading-relaxed`} />
                        : <input id={`email-${k}`} value={draft[k]} onChange={(e) => set(k, e.target.value)} className={`${inputCls} w-full`} />}
                      {HINTS[k] && <div className="mt-1 text-[11px] text-white/30">{HINTS[k]}</div>}
                    </div>
                  ))}

                  <div className="text-xs text-white/40">
                    משתנים שמתמלאים אוטומטית לכל ליד:{" "}
                    {detail.tokens.map((t) => <span key={t} dir="rtl" className="mx-0.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/70">{t}</span>)}
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <label className="mb-1 block text-xs text-white/50" htmlFor="email-change-note">מה שינית? (יופיע בהשוואת הגרסאות)</label>
                    <input id="email-change-note" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="למשל: נושא אישי יותר" className={`${inputCls} w-full`} />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={save} disabled={!dirty || saving || !draft.subject.trim()} className={goldBtn}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירה כגרסה חדשה"}
                      </button>
                      {dirty && <button onClick={() => { setDraft(detail.fields); setChangeNote(""); setMessage(""); }} className={ghostBtn}>ביטול השינויים</button>}
                      {FIELD_ORDER.some((k) => draft[k] !== detail.defaults[k]) && (
                        <button onClick={() => { setDraft(detail.defaults); setChangeNote("חזרה לנוסח המקורי"); }} className={ghostBtn}><RotateCcw className="h-4 w-4" /> טעינת הנוסח המקורי</button>
                      )}
                    </div>
                    {message && <div className="mt-2 text-sm text-emerald-300">{message}</div>}
                  </div>
                </div>

                {/* תצוגה מקדימה */}
                <div className="border-t border-white/10 bg-black/30 p-5 lg:border-r lg:border-t-0">
                  <div className="mb-2 text-xs text-white/40">כך המייל ייראה אצל הליד (עם ליד לדוגמה)</div>
                  <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                    <div className="truncate text-sm font-medium text-white">{preview?.subject || draft.subject}</div>
                    <div className="truncate text-xs text-white/45">{draft.preheader}</div>
                  </div>
                  {preview
                    ? <iframe title="תצוגה מקדימה של המייל" srcDoc={preview.html} sandbox="allow-same-origin" className="h-[62vh] w-full rounded-lg border border-white/10 bg-white" />
                    : <div className="flex h-[40vh] items-center justify-center text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>}
                </div>
              </div>
            )}

            {/* ===== המלצות ===== */}
            {tab === "advice" && (
              <div className="mx-auto max-w-3xl space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white/60">
                    המלצות לפי התפקיד של המייל, הנוסח, המספרים, ומה שעולה מהשיחות עם הסוכן.
                    {detail.advice && <span className="block text-xs text-white/35">הופקו {fmtFull(detail.advice.createdAt)}, על גרסה {detail.advice.version}</span>}
                  </div>
                  {detail.canAdvise && (
                    <button onClick={requestAdvice} disabled={advising} className={goldBtn}>
                      {advising ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {advising ? "מנתח את המייל..." : detail.advice ? "המלצות חדשות" : "הפקת המלצות"}
                    </button>
                  )}
                </div>
                {adviceMsg && <div className={`${cardCls} px-4 py-3 text-sm text-amber-200`}>{adviceMsg}</div>}
                {!detail.advice?.items.length && !adviceMsg && (
                  <div className={`${cardCls} px-6 py-12 text-center text-sm text-white/45`}>עוד לא הופקו המלצות למייל הזה.</div>
                )}
                {detail.advice?.items.map((a, i) => {
                  const applied = draft[a.field] === a.suggestion;
                  return (
                    <div key={i} className={`${cardCls} p-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="font-medium text-white">{a.title}</div>
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white/60">{EMAIL_FIELD_LABELS[a.field]}</span>
                      </div>
                      <div className="mt-1.5 text-sm leading-relaxed text-white/60">{a.why}</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-white/10 px-3 py-2">
                          <div className="text-[11px] text-white/35">עכשיו</div>
                          <div className="mt-0.5 whitespace-pre-line text-sm text-white/55">{detail.fields[a.field] || "(ריק)"}</div>
                        </div>
                        <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/5 px-3 py-2">
                          <div className="text-[11px] text-brand-gold/70">ההצעה</div>
                          <div className="mt-0.5 whitespace-pre-line text-sm text-white/90">{a.suggestion}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        {applied
                          ? <span className="inline-flex items-center gap-1 text-sm text-emerald-300"><Check className="h-4 w-4" /> הוחל על הטיוטה, נשאר לשמור</span>
                          : <button onClick={() => apply(a)} className={ghostBtn}>החלה על הטיוטה</button>}
                      </div>
                    </div>
                  );
                })}
                <div className="text-xs text-white/30">ההמלצות מוחלות על טיוטה בלבד. שום דבר לא נשלח ללידים עד שלוחצים &quot;שמירה כגרסה חדשה&quot;.</div>
              </div>
            )}

            {/* ===== לפני ואחרי ===== */}
            {tab === "versions" && (
              <div className="mx-auto max-w-4xl space-y-4 p-5">
                <div className="text-sm text-white/60">כל שמירה יוצרת גרסה. המספרים של כל גרסה נמדדים רק על המיילים שנשלחו בנוסח שלה, וכך רואים מה כל שינוי עשה.</div>
                <div className={`${cardCls} overflow-x-auto`}>
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs text-white/40">
                        <th className="px-4 py-3 font-medium">גרסה</th>
                        <th className="px-4 py-3 font-medium">מה שונה</th>
                        <th className="px-4 py-3 font-medium">נשלחו</th>
                        <th className="px-4 py-3 font-medium">נפתחו</th>
                        <th className="px-4 py-3 font-medium">הקליקו</th>
                        <th className="px-4 py-3 font-medium">קבעו פגישה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.versions.map((v) => {
                        const prev = prevOf(v);
                        return (
                          <tr key={v.version} className="border-b border-white/5">
                            <td className="whitespace-nowrap px-4 py-3.5">
                              <span className="font-medium text-white">גרסה {v.version}</span>
                              {v.current && <span className="mr-2 rounded-full bg-brand-gold/20 px-2 py-0.5 text-[11px] text-brand-gold">נוכחית</span>}
                              {v.createdAt && <div className="text-xs text-white/35">{fmtFull(v.createdAt)}</div>}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-white/60">{v.changeNote || "-"}</td>
                            <td className="px-4 py-3.5 text-white/70">{v.sent}</td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-emerald-300">{pct(v.openRate)}<Delta now={v.openRate} before={prev?.openRate ?? null} /></td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-sky-300">{pct(v.clickRate)}<Delta now={v.clickRate} before={prev?.clickRate ?? null} /></td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-brand-gold">{pct(v.advanceRate)}<Delta now={v.advanceRate} before={prev?.advanceRate ?? null} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-white/30">
                  החצים מראים את השינוי בנקודות אחוז מול הגרסה הקודמת. אחוזים מוצגים רק אחרי 5 שליחות מדודות לפחות, ועם מעט שליחות ההפרשים עדיין יכולים להיות מקריים.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
