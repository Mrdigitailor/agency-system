"use client";

// קביעת פגישה ישירה: לכאן מוביל הכפתור במיילים. הליד כבר מוכר לנו, אז הוא רק בוחר מועד.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";
import { loadTracking, trackFunnel } from "@/lib/prospect/track";

interface Slot { startIso: string; label: string }
const fmtFull = (iso: string) => new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function BookPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "pick" | "busy" | "done" | "missing" | "down">("loading");
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [phone, setPhone] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [existing, setExisting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const res = await fetch(`/api/public/book/${token}`).catch(() => null);
    if (!res) { setState("down"); return; }
    if (res.status === 404) { setState("missing"); return; }
    if (!res.ok) { setState("down"); return; }
    const d = await res.json();
    setName(d.name ?? "");
    if (d.meetingAt) { setMeetingAt(d.meetingAt); setExisting(true); setState("done"); return; }
    setSlots(d.slots ?? []); setState("pick");
  };

  useEffect(() => {
    load();
    loadTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // המועדים מקובצים לפי יום: התווית היא "יום, תאריך · שעה"
  const days = useMemo(() => {
    const map = new Map<string, Array<Slot & { time: string }>>();
    for (const s of slots) {
      const [day, time] = s.label.split(" · ");
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push({ ...s, time: time ?? "" });
    }
    return [...map.entries()].slice(0, 6);
  }, [slots]);

  const confirm = async () => {
    if (!picked) return;
    setState("busy"); setError("");
    const res = await fetch(`/api/public/book/${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startIso: picked.startIso, phone }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(d.error ?? "הקביעה נכשלה, נסו שוב"); setPicked(null);
      await load();
      return;
    }
    trackFunnel(["funnel_meeting_booked"]);
    setMeetingAt(d.meetingAt); setExisting(false); setState("done");
  };

  return (
    <div dir="rtl" className="flex min-h-dvh items-start justify-center bg-[#0a0908] px-4 py-8 font-ploni text-[#f4f0e7] sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#272319] bg-[#0d0c0a] shadow-2xl">
        <header className="flex items-center border-b border-[#272319] bg-black px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-mrdigitailors.svg" alt="Mr.digitailor" className="h-8" />
        </header>

        <div className="px-5 py-6 sm:px-7">
          {state === "loading" && <div className="flex items-center gap-2 py-10 text-[#a39c8d]"><Loader2 className="h-5 w-5 animate-spin" /> בודק מועדים פנויים ביומן...</div>}

          {state === "missing" && <p className="py-8 text-[#c9c2b3]">הקישור הזה לא תקף. אפשר להשיב למייל שקיבלת, ונתאם מועד משם.</p>}
          {state === "down" && <p className="py-8 text-[#c9c2b3]">היומן לא זמין כרגע. אפשר לנסות שוב בעוד כמה דקות, או להשיב למייל עם מועד שנוח לך.</p>}

          {(state === "pick" || state === "busy") && (
            <>
              <h1 className="text-2xl font-semibold">{name ? `${name}, מתי נוח לך?` : "מתי נוח לך?"}</h1>
              <p className="mt-2 leading-relaxed text-[#a39c8d]">פגישה של 30 דקות בזום. בוחרים מועד, וההזמנה עם הקישור מגיעה למייל.</p>
              {error && <p className="mt-3 rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p>}

              {days.length === 0 && <p className="mt-6 text-[#c9c2b3]">אין כרגע מועדים פנויים בשבועיים הקרובים. אפשר להשיב למייל שקיבלת עם מועד שנוח לך.</p>}

              <div className="mt-5 space-y-4">
                {days.map(([day, list]) => (
                  <div key={day}>
                    <div className="text-sm font-medium text-brand-gold">{day}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {list.map((s) => (
                        <button key={s.startIso} onClick={() => setPicked(s)} disabled={state === "busy"}
                          className={`rounded-lg border px-3.5 py-2 text-sm tabular-nums transition-colors duration-200 ${picked?.startIso === s.startIso ? "border-brand-gold bg-brand-gold text-black" : "border-[#3a3324] text-[#f4f0e7] hover:border-brand-gold"}`}>
                          {s.time}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {picked && (
                <div className="mt-6 border-t border-[#272319] pt-5">
                  <label className="block text-sm text-[#a39c8d]" htmlFor="phone">טלפון, למקרה שנצטרך לעדכן משהו לגבי הפגישה (לא חובה)</label>
                  <input id="phone" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-0000000"
                    className="mt-2 w-full rounded-lg border border-[#3a3324] bg-black px-3 py-2.5 text-right text-[#f4f0e7] outline-none transition-colors duration-200 focus:border-brand-gold" />
                  <button onClick={confirm} disabled={state === "busy"}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-gold px-6 py-3.5 font-semibold text-black transition-all duration-200 hover:brightness-95 disabled:opacity-60">
                    {state === "busy" ? <><Loader2 className="h-5 w-5 animate-spin" /> קובע...</> : <>לקבוע ל{picked.label.replace(" · ", " בשעה ")}</>}
                  </button>
                </div>
              )}
            </>
          )}

          {state === "done" && (
            <div className="py-6">
              <CalendarCheck className="h-10 w-10 text-brand-gold" />
              <h1 className="mt-4 text-2xl font-semibold">{existing ? "כבר קבענו פגישה" : "נקבע"}</h1>
              <p className="mt-2 text-lg text-brand-gold">{meetingAt && fmtFull(meetingAt)}</p>
              <p className="mt-3 leading-relaxed text-[#a39c8d]">
                {existing
                  ? "ההזמנה עם קישור הזום כבר במייל שלך. אם צריך לשנות מועד, אפשר להשיב למייל."
                  : "ההזמנה עם קישור הזום בדרך למייל שלך. נתראה."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
