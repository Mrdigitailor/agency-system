"use client";

// שאלון כניסה v2 — שאלה אחת על המסך, בר התקדמות מעודד, "למה אנחנו שואלים"
// ודוגמה לתשובה טובה בכל שאלה. שמירה אוטומטית בכל התקדמות — אפשר לעצור ולחזור.
import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  QUESTIONS, CHAPTERS,
  type Question, type Field, type AnswersV2, type AnswerValue, type UploadedFile,
} from "@/lib/onboarding/questions";

const TOTAL = QUESTIONS.length; // 24
const CONFIRM_STEP = TOTAL;     // מסך "מה שכבר סיפרת לנו"

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-light px-3.5 py-3 text-[15px] text-brand-dark placeholder:text-brand-muted/70 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 transition-colors";

// ---------- עזרי תשובות ----------
const asFields = (v?: AnswerValue): Record<string, string> =>
  v && !Array.isArray(v) && !("choice" in v) ? (v as Record<string, string>) : {};
const asRows = (v?: AnswerValue): Array<Record<string, string>> => (Array.isArray(v) ? v : []);
const asChoice = (v?: AnswerValue): { choice: string; detail?: string } =>
  v && !Array.isArray(v) && "choice" in v ? (v as { choice: string; detail?: string }) : { choice: "" };
const asUpload = (v?: AnswerValue): { files: UploadedFile[]; fields: Record<string, string> } => {
  if (v && !Array.isArray(v) && "files" in v) {
    const u = v as { files: UploadedFile[]; fields?: Record<string, string> };
    return { files: u.files ?? [], fields: u.fields ?? {} };
  }
  return { files: [], fields: {} };
};

function emptyRow(fields: Field[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

/** האם ענו על השאלה מספיק כדי להמשיך (שאלות optional תמיד עבירות) */
function isAnswered(q: Question, v?: AnswerValue): boolean {
  if (q.optional) return true;
  if (!v) return false;
  if (q.input.kind === "fields") {
    const required = q.input.fields.filter((f) => !f.optional);
    const vals = asFields(v);
    return required.length === 0
      ? Object.values(vals).some((s) => s.trim())
      : required.every((f) => (vals[f.key] ?? "").trim());
  }
  if (q.input.kind === "repeater") {
    const first = q.input.fields[0];
    return asRows(v).some((r) => (r[first.key] ?? "").trim());
  }
  if (q.input.kind === "upload") return asUpload(v).files.length > 0;
  return Boolean(asChoice(v).choice);
}

// ---------- שדה בודד ----------
function FieldInput({ field, value, onChange, autoFocus, onEnter }: {
  field: Field; value: string; onChange: (v: string) => void; autoFocus?: boolean; onEnter?: () => void;
}) {
  if (field.type === "textarea") {
    return (
      <textarea
        className={`${inputClass} min-h-32 resize-y leading-relaxed`}
        value={value} autoFocus={autoFocus}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <div className="flex flex-wrap gap-2">
        {(field.options ?? []).map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(value === opt ? "" : opt)}
            className={`rounded-lg border px-3.5 py-2 text-sm transition-colors duration-200 ${
              value === opt
                ? "border-brand-gold bg-brand-gold font-semibold text-brand-dark"
                : "border-brand-border bg-brand-light text-brand-dark hover:border-brand-gold"
            }`}>
            {opt}
          </button>
        ))}
      </div>
    );
  }
  return (
    <input
      type={field.type === "url" ? "url" : "text"}
      dir={field.type === "url" ? "ltr" : "rtl"}
      className={`${inputClass} ${field.type === "url" ? "text-left" : ""}`}
      value={value} autoFocus={autoFocus}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
    />
  );
}

// ---------- מרכיב העלאת קבצים ----------
function UploadBody({ q, token, value, onChange }: {
  q: Question & { input: Extract<Question["input"], { kind: "upload" }> };
  token: string; value?: AnswerValue; onChange: (v: AnswerValue) => void;
}) {
  const { accept, maxFiles, hint, extraFields } = q.input;
  const cur = asUpload(value);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploadError("");
    const room = (maxFiles ?? 15) - cur.files.length;
    const files = Array.from(list).slice(0, Math.max(room, 0));
    if (!files.length) { setUploadError(`אפשר להעלות עד ${maxFiles} קבצים`); return; }
    setUploading(true);
    const added: UploadedFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const blob = await upload(`onboarding/${token}/${Date.now()}_${f.name}`, f, {
          access: "private" as never,
          handleUploadUrl: `/api/public/questionnaire/${token}/upload`,
          contentType: f.type || "application/octet-stream",
          multipart: true,
          onUploadProgress: (e) => setProgress(Math.round(((i + e.percentage / 100) / files.length) * 100)),
        });
        added.push({ url: blob.url, name: f.name });
      }
      onChange({ files: [...cur.files, ...added], fields: cur.fields });
    } catch {
      setUploadError("ההעלאה נכשלה — נסה שוב, או דלג והדבק קישור לתיקייה");
      if (added.length) onChange({ files: [...cur.files, ...added], fields: cur.fields });
    } finally {
      setUploading(false); setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept={accept} multiple className="hidden"
        onChange={(e) => handleFiles(e.target.files)} />
      <button type="button" disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-lg border-2 border-dashed border-brand-gold/70 bg-brand-gold/5 px-4 py-6 text-center transition-colors hover:bg-brand-gold/10 disabled:opacity-60">
        <div className="text-2xl">📁</div>
        <div className="mt-1 text-sm font-semibold text-brand-dark">{uploading ? `מעלה… ${progress}%` : "לחץ לבחירת קבצים"}</div>
        {hint && !uploading && <div className="mt-0.5 text-xs text-brand-muted">{hint}</div>}
      </button>
      {uploading && (
        <div className="h-1.5 overflow-hidden rounded-full bg-brand-border">
          <div className="h-full rounded-full bg-brand-gold transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
      {uploadError && <p className="text-sm text-brand-danger">{uploadError}</p>}
      {cur.files.length > 0 && (
        <ul className="space-y-1.5">
          {cur.files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-light px-3 py-2 text-sm">
              <span className="truncate text-brand-dark">✓ {f.name}</span>
              <button type="button" className="shrink-0 text-xs text-brand-danger hover:underline"
                onClick={() => onChange({ files: cur.files.filter((_, j) => j !== i), fields: cur.fields })}>הסר</button>
            </li>
          ))}
        </ul>
      )}
      {(extraFields ?? []).map((f) => (
        <div key={f.key}>
          {f.label && (
            <label className="mb-1 block text-sm font-medium text-brand-dark">
              {f.label}{f.optional && <span className="mr-1 text-xs text-brand-muted">(לא חובה)</span>}
            </label>
          )}
          <FieldInput field={f} value={cur.fields[f.key] ?? ""}
            onChange={(v) => onChange({ files: cur.files, fields: { ...cur.fields, [f.key]: v } })} />
        </div>
      ))}
    </div>
  );
}

// ---------- גוף שאלה לפי סוג ----------
function QuestionBody({ q, token, value, onChange, onEnter }: {
  q: Question; token: string; value?: AnswerValue; onChange: (v: AnswerValue) => void; onEnter: () => void;
}) {
  if (q.input.kind === "upload") {
    return <UploadBody q={q as Question & { input: Extract<Question["input"], { kind: "upload" }> }} token={token} value={value} onChange={onChange} />;
  }
  if (q.input.kind === "fields") {
    const { fields } = q.input;
    const vals = asFields(value);
    const single = fields.length === 1;
    return (
      <div className="space-y-3.5">
        {fields.map((f, i) => (
          <div key={f.key}>
            {f.label && (
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                {f.label}{f.optional && <span className="mr-1 text-xs text-brand-muted">(לא חובה)</span>}
              </label>
            )}
            <FieldInput field={f} value={vals[f.key] ?? ""} autoFocus={i === 0}
              onChange={(v) => onChange({ ...emptyRow(fields), ...vals, [f.key]: v })}
              onEnter={single ? onEnter : undefined} />
          </div>
        ))}
      </div>
    );
  }

  if (q.input.kind === "repeater") {
    const { fields, itemLabel, addLabel, maxRows } = q.input;
    const rows = asRows(value);
    const shown = rows.length ? rows : [emptyRow(fields)];
    const setRow = (i: number, key: string, v: string) => {
      const next = shown.map((r, j) => (j === i ? { ...r, [key]: v } : r));
      onChange(next);
    };
    return (
      <div className="space-y-3">
        {shown.map((row, i) => (
          <div key={i} className="rounded-lg border border-brand-border bg-brand-bg p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-brand-muted">{itemLabel} {i + 1}</span>
              {shown.length > 1 && (
                <button type="button" className="text-xs text-brand-danger hover:underline"
                  onClick={() => onChange(shown.filter((_, j) => j !== i))}>הסר</button>
              )}
            </div>
            <div className="space-y-2.5">
              {fields.map((f) => (
                <div key={f.key}>
                  {f.label && <label className="mb-0.5 block text-xs font-medium text-brand-dark">{f.label}</label>}
                  <FieldInput field={f} value={row[f.key] ?? ""} onChange={(v) => setRow(i, f.key, v)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {(!maxRows || shown.length < maxRows) && (
          <button type="button" onClick={() => onChange([...shown, emptyRow(fields)])}
            className="w-full rounded-lg border border-dashed border-brand-gold/60 py-2.5 text-sm font-medium text-brand-dark transition-colors hover:bg-brand-gold/10">
            {addLabel}
          </button>
        )}
      </div>
    );
  }

  // choice
  const { options, detail } = q.input;
  const cur = asChoice(value);
  const showDetail = detail && cur.choice && detail.showFor.includes(cur.choice);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <button key={opt} type="button"
            onClick={() => onChange({ choice: opt, detail: cur.detail })}
            className={`rounded-lg border px-4 py-3 text-right text-[15px] transition-all duration-200 ${
              cur.choice === opt
                ? "border-brand-gold bg-brand-gold font-semibold text-brand-dark shadow-sm"
                : "border-brand-border bg-brand-light text-brand-dark hover:border-brand-gold hover:bg-brand-gold/5"
            }`}>
            {opt}
          </button>
        ))}
      </div>
      {showDetail && (
        <div className="pt-1">
          {detail.field.label && <label className="mb-1 block text-sm font-medium text-brand-dark">{detail.field.label}</label>}
          <FieldInput field={detail.field} value={cur.detail ?? ""} autoFocus
            onChange={(v) => onChange({ choice: cur.choice, detail: v })} onEnter={onEnter} />
        </div>
      )}
    </div>
  );
}

// ---------- הקומפוננטה הראשית ----------
export default function QuestionnaireForm({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "notFound" | "intro" | "form" | "submitting" | "done">("loading");
  const [clientName, setClientName] = useState("");
  const [prefill, setPrefill] = useState({ dealValue: "", budget: "" });
  const [answers, setAnswers] = useState<AnswersV2>({ step: 0, data: {} });
  const [step, setStep] = useState(0); // 0..23 שאלות · 24 אישור
  const [confirm, setConfirm] = useState({ dealValue: "", budget: "", note: "" });
  const [shake, setShake] = useState(false);
  const [anim, setAnim] = useState(0); // מפתח אנימציית כניסה
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = step < TOTAL ? QUESTIONS[step] : null;
  const chapter = q ? CHAPTERS.find((c) => c.num === q.chapter) : null;
  const isChapterStart = q ? QUESTIONS.findIndex((x) => x.chapter === q.chapter) === step : false;
  const progress = Math.round(((step + (state === "done" ? 1 : 0)) / (TOTAL + 1)) * 100);

  // טעינה ראשונית
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/questionnaire/${token}`);
        if (!res.ok) { setState("notFound"); return; }
        const json = await res.json();
        if (json.status === "completed") { setState("done"); return; }
        setClientName(json.clientName ?? "");
        setPrefill(json.prefill ?? { dealValue: "", budget: "" });
        const saved: AnswersV2 = json.answers ?? { step: 0, data: {} };
        setAnswers(saved);
        if (saved.confirm) setConfirm(saved.confirm);
        else setConfirm({ dealValue: json.prefill?.dealValue ?? "", budget: json.prefill?.budget ?? "", note: "" });
        // חוזרים לאותה נקודה אם כבר התחיל
        const resumeStep = Math.min(saved.step ?? 0, CONFIRM_STEP);
        if (resumeStep > 0 && Object.keys(saved.data).length > 0) { setStep(resumeStep); setState("form"); }
        else setState("intro");
      } catch { setState("notFound"); }
    })();
  }, [token]);

  // שמירת טיוטה (debounced) — הלקוח יכול לסגור ולחזור
  const saveDraft = useCallback((next: AnswersV2, nextConfirm: typeof confirm) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/public/questionnaire/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, confirm: nextConfirm }),
      }).catch(() => {});
    }, 600);
  }, [token]);

  const setAnswer = (id: string, v: AnswerValue) => {
    setAnswers((prev) => {
      const next = { ...prev, data: { ...prev.data, [id]: v } };
      saveDraft(next, confirm);
      return next;
    });
  };

  const goTo = (nextStep: number) => {
    setError("");
    setStep(nextStep);
    setAnim((n) => n + 1);
    setAnswers((prev) => {
      const next = { ...prev, step: nextStep };
      saveDraft(next, confirm);
      return next;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    if (q && !isAnswered(q, answers.data[q.id])) {
      setShake(true); setTimeout(() => setShake(false), 450);
      setError("רק שנייה — צריך לענות כאן לפני שממשיכים 🙂");
      return;
    }
    goTo(step + 1);
  };
  const back = () => { if (step > 0) goTo(step - 1); };
  const skip = () => goTo(step + 1);

  const submit = async () => {
    setState("submitting");
    try {
      const res = await fetch(`/api/public/questionnaire/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, step: CONFIRM_STEP, confirm }),
      });
      if (res.ok) setState("done");
      else { setState("form"); setError("משהו השתבש בשליחה — נסה שוב"); }
    } catch { setState("form"); setError("משהו השתבש בשליחה — נסה שוב"); }
  };

  const primaryBtn = "rounded-lg bg-brand-gold px-7 py-3 text-[15px] font-bold text-brand-dark shadow-sm transition-all duration-200 hover:brightness-95 active:scale-[.98]";
  const ghostBtn = "rounded-lg px-4 py-3 text-sm text-brand-muted transition-colors hover:text-brand-dark";

  // ---------- מצבים ----------
  if (state === "loading") return <div className="py-24 text-center text-brand-muted">רק רגע…</div>;
  if (state === "notFound") return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-lg font-semibold text-brand-dark">הקישור לא נמצא</p>
      <p className="mt-2 text-sm text-brand-muted">יכול להיות שפג תוקפו — דברו איתנו ונשלח קישור חדש.</p>
    </div>
  );
  if (state === "done") return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <div className="text-5xl">👏</div>
      <h1 className="mt-4 text-2xl font-semibold text-brand-dark">זהו! נתת לנו בדיוק את מה שצריך.</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-brand-muted">
        מהרגע הזה אנחנו על זה: מחקר ← קופי ← עיצוב ← הדף שלך באוויר.
        נעדכן אותך בכל אבן דרך, והדבר הבא שתראה מאיתנו זה טיוטת הדף לאישור שלך.
      </p>
    </div>
  );
  if (state === "intro") return (
    <div className="mx-auto max-w-lg py-14">
      <div className="rounded-xl border border-brand-border bg-brand-light p-8 shadow-sm">
        <div className="text-4xl">🎉</div>
        <h1 className="mt-3 text-2xl font-semibold leading-snug text-brand-dark">
          {clientName ? `${clientName}, ברוכים הבאים למשפחה!` : "ברוכים הבאים למשפחה!"}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-muted">
          ב-15 הדקות הקרובות אתה הולך לתת לנו את חומר הגלם הכי חשוב שיש — ההיכרות עם העסק שלך.
          כל תשובה כאן מתורגמת ישירות לדף הנחיתה, למודעות ולסוכן שיעבוד בשבילך.
          ככל שתפרט יותר, המכונה שלך תהיה מדויקת יותר.
        </p>
        <p className="mt-2 text-sm text-brand-muted">אפשר לעצור באמצע — הכל נשמר, וחוזרים בדיוק לאותה נקודה.</p>
        <button className={`${primaryBtn} mt-6 w-full`} onClick={() => { setState("form"); setAnim((n) => n + 1); }}>
          יאללה, מתחילים ←
        </button>
      </div>
    </div>
  );

  // ---------- form ----------
  return (
    <div className="mx-auto max-w-xl pb-16">
      <style>{`
        @keyframes qSlideIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes qShake { 20%,60% { transform: translateX(5px); } 40%,80% { transform: translateX(-5px); } }
        .q-enter { animation: qSlideIn .35s ease both; }
        .q-shake { animation: qShake .4s ease; }
        @media (prefers-reduced-motion: reduce) { .q-enter, .q-shake { animation: none; } }
      `}</style>

      {/* בר התקדמות */}
      <div className="sticky top-0 z-10 -mx-4 bg-brand-bg/95 px-4 pb-3 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mb-1.5 flex items-center justify-between text-xs text-brand-muted">
          <span>{step < TOTAL ? `שאלה ${step + 1} מתוך ${TOTAL}` : "צעד אחרון"}</span>
          <span className="font-semibold text-brand-dark">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-brand-border">
          <div className="h-full rounded-full bg-brand-gold transition-all duration-500" style={{ width: `${Math.max(progress, 3)}%` }} />
        </div>
        {isChapterStart && chapter?.milestone && (
          <p className="mt-2 text-[13px] font-semibold text-brand-dark">{chapter.milestone}</p>
        )}
      </div>

      {/* מסך שאלה */}
      {q ? (
        <div key={anim} className={`q-enter mt-6 ${shake ? "q-shake" : ""}`}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-muted">
            פרק {chapter?.num} · {chapter?.title}
          </div>
          <h1 className="text-xl font-semibold leading-snug text-brand-dark sm:text-[22px]">{q.title}</h1>

          <div className="mt-3 rounded-lg border-r-[3px] border-brand-info bg-brand-info/5 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-brand-muted">
            <span className="font-semibold text-brand-info">למה אנחנו שואלים? </span>{q.why}
          </div>
          {q.example && (
            <div className="mt-2 rounded-lg border-r-[3px] border-brand-success bg-brand-success/5 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-brand-muted">
              <span className="font-semibold text-brand-success">דוגמה לתשובה טובה: </span>{q.example}
            </div>
          )}

          <div className="mt-5">
            <QuestionBody q={q} token={token} value={answers.data[q.id]} onChange={(v) => setAnswer(q.id, v)} onEnter={next} />
          </div>

          {error && <p className="mt-3 text-sm font-medium text-brand-danger">{error}</p>}

          <div className="mt-6 flex items-center justify-between">
            <button type="button" className={ghostBtn} onClick={back} disabled={step === 0}
              style={step === 0 ? { visibility: "hidden" } : undefined}>→ חזור</button>
            <div className="flex items-center gap-2">
              {q.optional && (
                <button type="button" className={ghostBtn} onClick={skip}>דלג</button>
              )}
              <button type="button" className={primaryBtn} onClick={next}>המשך ←</button>
            </div>
          </div>
        </div>
      ) : (
        /* מסך אישור — "מה שכבר סיפרת לנו" */
        <div key={anim} className="q-enter mt-6">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-muted">צעד אחרון</div>
          <h1 className="text-xl font-semibold leading-snug text-brand-dark sm:text-[22px]">מה שכבר סיפרת לנו — עדיין נכון?</h1>
          <p className="mt-2 text-sm leading-relaxed text-brand-muted">
            את הנתונים האלה מסרת לנו לפני שסגרנו — אנחנו לא שואלים שוב, רק נותנים לתקן אם משהו השתנה.
          </p>
          <div className="mt-5 space-y-3.5 rounded-xl border border-brand-border bg-brand-light p-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">עסקה ממוצעת (₪)</label>
              <input className={inputClass} value={confirm.dealValue}
                placeholder={prefill.dealValue || "למשל: 6,500"}
                onChange={(e) => { const c = { ...confirm, dealValue: e.target.value.slice(0, 100) }; setConfirm(c); saveDraft(answers, c); }} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">תקציב פרסום חודשי (₪)</label>
              <input className={inputClass} value={confirm.budget}
                placeholder={prefill.budget || "למשל: 8,000"}
                onChange={(e) => { const c = { ...confirm, budget: e.target.value.slice(0, 100) }; setConfirm(c); saveDraft(answers, c); }} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">משהו נוסף שחשוב שנדע? <span className="text-xs text-brand-muted">(לא חובה)</span></label>
              <textarea className={`${inputClass} min-h-20`} value={confirm.note}
                onChange={(e) => { const c = { ...confirm, note: e.target.value.slice(0, 1000) }; setConfirm(c); saveDraft(answers, c); }} />
            </div>
          </div>
          {error && <p className="mt-3 text-sm font-medium text-brand-danger">{error}</p>}
          <div className="mt-6 flex items-center justify-between">
            <button type="button" className={ghostBtn} onClick={back}>→ חזור</button>
            <button type="button" className={primaryBtn} onClick={submit} disabled={state === "submitting"}>
              {state === "submitting" ? "שולח…" : "סיימתי — שלח 🎉"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
