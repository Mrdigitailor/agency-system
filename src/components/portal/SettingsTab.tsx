"use client";

// הגדרות הפורטל: לאן נשלחות ההתראות, אילו התראות פעילות, החלפת סיסמה ויציאה.
import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, Check } from "lucide-react";
import { cardCls, inputCls, goldBtn, ghostBtn, portalApi, PageTitle } from "./shared";

interface Settings { ownerEmail: string; notifyLead: boolean; notifyMeeting: boolean; weeklyReport: boolean }
const TOGGLES: Array<{ key: "notifyLead" | "notifyMeeting" | "weeklyReport"; label: string; sub: string }> = [
  { key: "notifyLead", label: "ליד חדש", sub: "מייל מיידי ברגע שמישהו משאיר פרטים בשיחה עם הסוכן" },
  { key: "notifyMeeting", label: "פגישה שנקבעה", sub: "מייל מיידי כשהסוכן קובע פגישה ביומן" },
  { key: "weeklyReport", label: "סיכום שבועי", sub: "כל יום ראשון: מה קרה בשבוע האחרון ומה מחכה לטיפול" },
];

export default function SettingsTab({ token, demo, onLogout }: { token: string; demo: boolean; onLogout: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"" | "saving" | "saved" | string>("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwState, setPwState] = useState<"" | "saving" | "saved" | string>("");

  const load = useCallback(async () => {
    const res = await portalApi<Settings>(token, { query: "view=settings" });
    if (res.ok) { setS(res.data); setEmail(res.data.ownerEmail ?? ""); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const saveEmail = async () => {
    setEmailState("saving");
    const res = await portalApi<{ error?: string }>(token, { method: "PATCH", body: { kind: "settings", ownerEmail: email } });
    setEmailState(res.ok ? "saved" : (res.data.error ?? "השמירה נכשלה"));
    if (res.ok && s) setS({ ...s, ownerEmail: email.trim().toLowerCase() });
  };

  const toggle = async (key: "notifyLead" | "notifyMeeting" | "weeklyReport") => {
    if (!s) return;
    const value = !s[key];
    setS({ ...s, [key]: value });
    await portalApi(token, { method: "PATCH", body: { kind: "settings", [key]: value } });
  };

  const changePassword = async () => {
    setPwState("saving");
    const res = await portalApi<{ error?: string }>(token, { path: "/auth", method: "POST", body: { action: "change", password: current, newPassword: next } });
    if (res.ok) { setPwState("saved"); setCurrent(""); setNext(""); }
    else setPwState(res.data.error ?? "ההחלפה נכשלה");
  };

  const logout = async () => {
    await portalApi(token, { path: "/auth", method: "POST", body: { action: "logout" } });
    onLogout();
  };

  const status = (state: string) => state === "saved"
    ? <span className="inline-flex items-center gap-1 text-sm text-emerald-300"><Check className="h-4 w-4" /> נשמר</span>
    : state && state !== "saving" ? <span className="text-sm text-red-300">{state}</span> : null;

  return (
    <>
      <PageTitle title="הגדרות" sub="לאן נשלחות ההתראות, ואיך נכנסים למערכת" />
      {!s && <div className="py-16 text-center text-white/40"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>}

      {s && (
        <>
          <div className={`${cardCls} p-5`}>
            <div className="text-sm font-medium text-white/80">התראות במייל</div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <label className="mb-1 block text-xs text-white/50" htmlFor="owner-email">כתובת המייל שמקבלת את ההתראות</label>
                <input id="owner-email" type="email" dir="ltr" value={email} onChange={(e) => { setEmail(e.target.value); setEmailState(""); }}
                  placeholder="name@example.co.il" className={`${inputCls} w-full`} />
              </div>
              <button onClick={saveEmail} disabled={demo || emailState === "saving" || email.trim().toLowerCase() === s.ownerEmail} className={goldBtn}>
                {emailState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירה"}
              </button>
              {status(emailState)}
            </div>
            {!s.ownerEmail && <div className="mt-2 text-xs text-amber-300">עוד לא הוגדר מייל, אז שום התראה לא נשלחת כרגע.</div>}

            <div className="mt-5 space-y-1">
              {TOGGLES.map((t) => (
                <button key={t.key} onClick={() => toggle(t.key)} disabled={demo} role="switch" aria-checked={s[t.key]}
                  className="flex w-full items-center justify-between gap-4 rounded-lg px-2 py-3 text-right transition-colors duration-200 hover:bg-white/[0.04]">
                  <span>
                    <span className="block text-sm text-white">{t.label}</span>
                    <span className="block text-xs text-white/45">{t.sub}</span>
                  </span>
                  <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${s[t.key] ? "bg-brand-gold" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition-all duration-200 ${s[t.key] ? "right-0.5" : "right-[22px]"}`} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {demo ? (
            <div className={`${cardCls} px-5 py-4 text-sm text-white/50`}>זו סביבת הדגמה, אז שינויים לא נשמרים. במערכת אמיתית יש כאן גם החלפת סיסמה ויציאה.</div>
          ) : (
            <div className={`${cardCls} p-5`}>
              <div className="text-sm font-medium text-white/80">סיסמה וכניסה</div>
              <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); changePassword(); }}>
                <div>
                  <label className="mb-1 block text-xs text-white/50" htmlFor="pw-current">הסיסמה הנוכחית</label>
                  <input id="pw-current" type="password" dir="ltr" autoComplete="current-password" value={current}
                    onChange={(e) => { setCurrent(e.target.value); setPwState(""); }} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/50" htmlFor="pw-next">סיסמה חדשה (8 תווים לפחות)</label>
                  <input id="pw-next" type="password" dir="ltr" autoComplete="new-password" value={next}
                    onChange={(e) => { setNext(e.target.value); setPwState(""); }} className={inputCls} />
                </div>
                <button type="submit" disabled={pwState === "saving" || !current || next.length < 8} className={goldBtn}>
                  {pwState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : "החלפת סיסמה"}
                </button>
                {status(pwState)}
              </form>
              <div className="mt-5 border-t border-white/10 pt-4">
                <button onClick={logout} className={ghostBtn}><LogOut className="h-4 w-4" /> יציאה מהמערכת</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
