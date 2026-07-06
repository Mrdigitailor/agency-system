"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsSetup) router.replace("/setup");
        else setCheckingSetup(false);
      })
      .catch(() => setCheckingSetup(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("אימייל או סיסמה שגויים");
    } else {
      // שליפת תפקיד מה-session לניתוב נכון
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      const role = session?.user?.role ?? "campaignManager";

      let home = "/dashboard";
      if (role === "client") home = "/client-portal";

      router.push(home);
      router.refresh();
    }
  };

  if (checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <div className="text-brand-muted">טוען...</div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-brand-border bg-brand-bg px-4 py-3 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark p-4">
      <div className="w-full max-w-md">
        {/* לוגו */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/images/logo-mrdigitailors.svg"
            alt="Mr.digitailor"
            width={200}
            height={50}
            priority
          />
        </div>

        {/* כרטיס לוגין */}
        <div className="rounded-lg bg-brand-light p-8 shadow-sm">
          <h1 className="mb-6 text-center text-xl font-semibold text-brand-dark">
            כניסה למערכת
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                אימייל
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="email@example.com"
                required
                dir="ltr"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">
                סיסמה
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                required
                dir="ltr"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-brand-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-gold px-4 py-3 text-sm font-semibold text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 disabled:opacity-50"
            >
              {loading ? "מתחבר..." : "התחבר"}
            </button>
          </form>

          {/* מפריד */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-brand-border" />
            <span className="text-xs text-brand-muted">או</span>
            <div className="h-px flex-1 bg-brand-border" />
          </div>

          {/* Google */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-brand-border bg-brand-light px-4 py-3 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-bg"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            התחבר עם Google
          </button>
        </div>
      </div>
    </div>
  );
}
