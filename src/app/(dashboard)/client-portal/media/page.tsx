"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * דוח המדיה של הלקוח. הדוח הוא דף HTML עצמאי שנבנה מחוץ למערכת ומוגש
 * מאחורי ההתחברות דרך /api/client-portal/media-report — כאן רק ממסגרים אותו.
 */
export default function ClientPortalMediaPage() {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    fetch("/api/client-portal/media-report?check=1")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => setState(d.available ? "ready" : "missing"))
      .catch(() => setState("missing"));
  }, []);

  if (state === "loading") {
    return (
      <div className="flex h-64 items-center justify-center text-brand-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (state === "missing") {
    return (
      <div dir="rtl" className="rounded-lg border border-brand-border bg-brand-light p-8 text-center text-brand-muted">
        דוח המדיה עדיין לא זמין לחשבון זה.
      </div>
    );
  }

  return (
    <iframe
      src="/api/client-portal/media-report"
      title="דוח מדיה"
      className="-m-6 block w-[calc(100%+3rem)] border-0"
      style={{ height: "calc(100vh - 64px)" }}
    />
  );
}
