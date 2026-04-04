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
            alt="DigiTailors"
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
        </div>
      </div>
    </div>
  );
}
