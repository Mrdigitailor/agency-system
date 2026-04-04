"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((data) => {
        if (!data.needsSetup) router.replace("/login");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("הסיסמאות לא תואמות");
      return;
    }
    if (password.length < 6) {
      setError("הסיסמה חייבת להיות לפחות 6 תווים");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "שגיאה ביצירת המשתמש");
    } else {
      router.push("/login");
    }
  };

  if (checking) {
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

        {/* כרטיס הגדרה */}
        <div className="rounded-lg bg-brand-light p-8 shadow-sm">
          <h1 className="mb-2 text-center text-xl font-semibold text-brand-dark">
            הגדרת מנהל ראשון
          </h1>
          <p className="mb-6 text-center text-sm text-brand-muted">
            ברוכים הבאים! צרו את חשבון המנהל הראשון
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">שם מלא</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="שם מלא" required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">אימייל</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="email@example.com" required dir="ltr" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">סיסמה</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="לפחות 6 תווים" required dir="ltr" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">אישור סיסמה</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} placeholder="הזן שוב" required dir="ltr" />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-brand-danger">{error}</p>
            )}

            <button type="submit" disabled={loading} className="w-full rounded-lg bg-brand-gold px-4 py-3 text-sm font-semibold text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80 disabled:opacity-50">
              {loading ? "יוצר חשבון..." : "צור חשבון מנהל"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
