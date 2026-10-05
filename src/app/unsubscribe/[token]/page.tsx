"use client";

// דף ההסרה מרשימת התפוצה: לחיצה אחת לאישור.
import { useState } from "react";
import { useParams } from "next/navigation";

export default function UnsubscribePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const confirm = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/public/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      setState(res.ok ? "done" : "error");
    } catch { setState("error"); }
  };

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-brand-bg px-4 font-ploni">
      <div className="w-full max-w-md rounded-lg border border-brand-border bg-white p-8 text-center shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-sig.png" alt="Mr.digitailor" className="mx-auto h-11" />
        {state === "done" ? (
          <>
            <h1 className="mt-6 text-xl font-semibold text-brand-dark">הוסרת מרשימת התפוצה</h1>
            <p className="mt-2 text-sm text-brand-muted">לא נשלח אליך מיילים נוספים. אם קבעת איתנו פגישה, תזכורת לפגישה עדיין תגיע.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold text-brand-dark">להפסיק לקבל מאיתנו מיילים?</h1>
            <p className="mt-2 text-sm text-brand-muted">לחיצה אחת, ולא נשלח אליך מיילים נוספים.</p>
            <button onClick={confirm} disabled={state === "busy"}
              className="mt-6 rounded-lg bg-brand-gold px-6 py-2.5 text-sm font-medium text-brand-dark transition-all duration-200 hover:brightness-95 disabled:opacity-50">
              {state === "busy" ? "מסיר..." : "כן, להסיר אותי"}
            </button>
            {state === "error" && <p className="mt-3 text-sm text-brand-danger">משהו השתבש. אפשר לנסות שוב, או פשוט להשיב למייל ולבקש הסרה.</p>}
          </>
        )}
      </div>
    </div>
  );
}
