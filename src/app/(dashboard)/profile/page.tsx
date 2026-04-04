"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { User, Lock } from "lucide-react";

const roleLabels: Record<string, string> = {
  admin: "בעלים",
  manager: "סמנכ״ל / מנהל תיקים",
  campaignManager: "מנהל קמפיינים",
  client: "לקוח",
};

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

const buttonClass =
  "rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80";

const cardClass =
  "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

export default function ProfilePage() {
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const user = session?.user as
    | { name?: string; email?: string; role?: string }
    | undefined;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 6) {
      setError("הסיסמה החדשה חייבת להכיל לפחות 6 תווים");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "אירעה שגיאה בעת שינוי הסיסמה");
        return;
      }

      setSuccess("הסיסמה עודכנה בהצלחה!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("אירעה שגיאה בעת שינוי הסיסמה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-brand-dark">הגדרות אישיות</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* פרטים אישיים */}
        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-brand-gold" />
            <h2 className="text-lg font-semibold text-brand-dark">
              פרטים אישיים
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-muted">
                שם
              </label>
              <p className="text-sm text-brand-dark">
                {user?.name || "—"}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-muted">
                אימייל
              </label>
              <p className="text-sm text-brand-dark">
                {user?.email || "—"}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-muted">
                תפקיד
              </label>
              <p className="text-sm text-brand-dark">
                {user?.role ? roleLabels[user.role] || user.role : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* שינוי סיסמה */}
        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-brand-gold" />
            <h2 className="text-lg font-semibold text-brand-dark">
              שינוי סיסמה
            </h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-muted">
                סיסמה נוכחית
              </label>
              <input
                type="password"
                className={inputClass}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-muted">
                סיסמה חדשה
              </label>
              <input
                type="password"
                className={inputClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-muted">
                אישור סיסמה חדשה
              </label>
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            {success && (
              <p className="text-sm text-green-600">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={buttonClass}
            >
              {loading ? "מעדכן..." : "עדכן סיסמה"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
