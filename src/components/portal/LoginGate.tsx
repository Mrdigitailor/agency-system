"use client";

// מסך הכניסה לפורטל: קביעת סיסמה בביקור הראשון, או הזנת סיסמה בכל כניסה אחרת.
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { portalApi, inputCls, goldBtn } from "./shared";

const MIN_PASSWORD = 8;

export default function LoginGate({ token, mode, name, onDone }: {
  token: string; mode: "needSetup" | "needPassword"; name: string; onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setup = mode === "needSetup";

  const submit = async () => {
    setError("");
    if (setup && password.length < MIN_PASSWORD) { setError(`הסיסמה צריכה להיות באורך ${MIN_PASSWORD} תווים לפחות`); return; }
    if (setup && password !== confirm) { setError("שתי הסיסמאות לא זהות"); return; }
    if (!password) return;
    setBusy(true);
    const res = await portalApi<{ error?: string }>(token, { path: "/auth", method: "POST", body: { action: setup ? "setup" : "login", password } });
    setBusy(false);
    if (res.ok) { onDone(); return; }
    setError(res.data.error ?? "משהו השתבש, נסו שוב");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-8" />
        <div className="mt-6 flex items-center gap-2 text-lg font-semibold text-white">
          <Lock className="h-5 w-5 text-brand-gold" /> {setup ? "קביעת סיסמה" : "כניסה למערכת"}
        </div>
        <p className="mt-1 text-sm text-white/50">
          {setup
            ? `זו הכניסה הראשונה למערכת של ${name}. בחרו סיסמה, והיא תידרש בכל כניסה מעכשיו.`
            : `מכונת הלידים של ${name}`}
        </p>

        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div>
            <label className="mb-1 block text-xs text-white/50" htmlFor="portal-password">{setup ? "סיסמה חדשה" : "סיסמה"}</label>
            <input id="portal-password" type="password" dir="ltr" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={setup ? "new-password" : "current-password"} className={`${inputCls} w-full`} />
          </div>
          {setup && (
            <div>
              <label className="mb-1 block text-xs text-white/50" htmlFor="portal-password-confirm">שוב, לאימות</label>
              <input id="portal-password-confirm" type="password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" className={`${inputCls} w-full`} />
            </div>
          )}
          {error && <div className="text-sm text-red-300">{error}</div>}
          <button type="submit" disabled={busy || !password} className={`${goldBtn} w-full justify-center py-2.5`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : setup ? "שמירה וכניסה" : "כניסה"}
          </button>
        </form>
        {!setup && <p className="mt-4 text-xs text-white/35">שכחתם את הסיסמה? פנו אלינו ונאפס אותה.</p>}
      </div>
    </div>
  );
}
