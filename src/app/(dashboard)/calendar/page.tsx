"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useApp } from "@/lib/data/context";
import Modal from "@/components/ui/Modal";
import { ChevronRight, ChevronLeft, Plus, Calendar, Link2, X, Pencil, Trash2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

interface ManualEvent {
  id: string;
  title: string;
  date: string;
  type: "פגישה" | "שיחה" | "אחר";
  startTime?: string;
  endTime?: string;
  description?: string;
  clientId?: string;
  colorId?: string;
  reminder?: number;
}

type ViewMode = "חודשי" | "שבועי" | "יומי";

const GCAL_COLOR_MAP: Record<string, string> = {
  "1": "bg-blue-500",
  "2": "bg-green-500",
  "3": "bg-purple-500",
  "4": "bg-red-500",
  "6": "bg-orange-500",
};

const COLOR_OPTIONS = [
  { id: "1", label: "כחול" },
  { id: "2", label: "ירוק" },
  { id: "3", label: "סגול" },
  { id: "4", label: "אדום" },
  { id: "6", label: "כתום" },
];

const REMINDER_OPTIONS = [
  { value: 15, label: "15 דקות לפני" },
  { value: 30, label: "30 דקות לפני" },
  { value: 60, label: "שעה לפני" },
  { value: 1440, label: "יום לפני" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0:00 to 23:00

function formatDateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const HOLIDAYS: { date: string; name: string }[] = [
  { date: "2026-03-21", name: "פורים" },
  { date: "2026-04-11", name: "ערב פסח" },
  { date: "2026-04-17", name: "שביעי של פסח" },
  { date: "2026-06-01", name: "שבועות" },
  { date: "2026-09-22", name: "ראש השנה" },
  { date: "2026-10-01", name: "יום כיפור" },
  { date: "2026-10-06", name: "סוכות" },
];

const HOLIDAY_MAP = new Map(HOLIDAYS.map((h) => [h.date, h.name]));

const EVENT_TYPES = ["פגישה", "שיחה", "אחר"] as const;

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

/* ------------------------------------------------------------------ */
/*  Date utilities                                                     */
/* ------------------------------------------------------------------ */

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function getWeekDates(base: Date): Date[] {
  const day = base.getDay();
  const start = new Date(base);
  start.setDate(start.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CalendarPage() {
  const { data: session } = useSession();
  const { tasks, clients } = useApp();

  const role = (session?.user as { role?: string })?.role;
  const userName = session?.user?.name ?? "";

  /* --- State --- */
  const [viewMode, setViewMode] = useState<ViewMode>("חודשי");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<ManualEvent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    type: "פגישה" as ManualEvent["type"],
    startTime: "",
    endTime: "",
    description: "",
    clientId: "",
    colorId: "1",
    reminder: 30,
    saveToGcal: true,
  });

  // Detail panel state
  const [detailEvent, setDetailEvent] = useState<{
    source: "gcal" | "manual" | "task";
    id: string;
    title: string;
    time?: string;
    description?: string;
    colorId?: string;
  } | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const [editFields, setEditFields] = useState({ title: "", description: "" });

  // Google Calendar
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalEvents, setGcalEvents] = useState<Array<{ id: string; title: string; start: string; end: string; allDay: boolean; description?: string; colorId?: string }>>([]);
  const [gcalEmail, setGcalEmail] = useState("");

  const fetchGcalEvents = useCallback(async (date: Date) => {
    // שלוף חודש +/- שבוע כדי לתפוס אירועים בתצוגה שבועית/יומית
    const y = date.getFullYear();
    const m = date.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00+03:00`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, "0")}-${lastDay}T23:59:59+03:00`;

    console.log("[Calendar UI] Fetching events:", start, "→", end);
    try {
      const res = await fetch(`/api/calendar/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}`);
      const data = await res.json();
      console.log("[Calendar UI] Response:", { connected: data.connected, eventCount: data.events?.length ?? 0, error: data.error });
      setGcalConnected(data.connected);
      setGcalEvents(data.events ?? []);
      if (data.email) setGcalEmail(data.email);
      if (data.error) console.error("[Calendar UI] API error:", data.error);
    } catch (err) {
      console.error("[Calendar UI] Fetch failed:", err);
    }
  }, []);

  useEffect(() => { fetchGcalEvents(currentDate); }, [currentDate, fetchGcalEvents]);

  const handleConnectGcal = async () => {
    const res = await fetch("/api/calendar/connect");
    const data = await res.json();
    if (data.authUrl) window.location.href = data.authUrl;
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayKey = formatDateKey(new Date());

  /* --- Filtered tasks --- */
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (role === "campaignManager") {
      return tasks.filter((t: any) => t.assignee === userName);
    }
    return tasks;
  }, [tasks, role, userName]);

  /* --- Helpers to bucket data by date key --- */
  const tasksByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of filteredTasks) {
      if (!t.dueDate) continue;
      const key = typeof t.dueDate === "string" ? t.dueDate.split("T")[0] : formatDateKey(new Date(t.dueDate));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [filteredTasks]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ManualEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  const gcalByDate = useMemo(() => {
    const map = new Map<string, typeof gcalEvents>();
    for (const e of gcalEvents) {
      const key = e.start?.split("T")[0] ?? "";
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [gcalEvents]);

  /* --- Navigation --- */
  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }
  function prevWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }
  function nextWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }
  function prevDay() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  }
  function nextDay() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  }

  /* --- Add event handler --- */
  async function handleAddEvent() {
    if (!newEvent.title || !newEvent.date) return;

    const manualEvent: ManualEvent = {
      id: crypto.randomUUID(),
      title: newEvent.title,
      date: newEvent.date,
      type: newEvent.type,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      description: newEvent.description,
      clientId: newEvent.clientId,
      colorId: newEvent.colorId,
      reminder: newEvent.reminder,
    };
    setEvents((prev) => [...prev, manualEvent]);

    // Save to Google Calendar if requested
    if (newEvent.saveToGcal && gcalConnected && newEvent.startTime && newEvent.endTime) {
      try {
        await fetch("/api/calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newEvent.title,
            startDateTime: `${newEvent.date}T${newEvent.startTime}:00`,
            endDateTime: `${newEvent.date}T${newEvent.endTime}:00`,
            description: newEvent.description,
            colorId: newEvent.colorId,
            reminder: newEvent.reminder,
          }),
        });
        fetchGcalEvents(currentDate);
      } catch {}
    }

    setNewEvent({ title: "", date: "", type: "פגישה", startTime: "", endTime: "", description: "", clientId: "", colorId: "1", reminder: 30, saveToGcal: true });
    setShowModal(false);
  }

  /* --- Detail panel handlers --- */
  async function handleDeleteGcalEvent(eventId: string) {
    try {
      await fetch(`/api/calendar/events?eventId=${eventId}`, { method: "DELETE" });
      fetchGcalEvents(currentDate);
      setDetailEvent(null);
    } catch {}
  }

  async function handleEditGcalEvent(eventId: string) {
    try {
      await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, title: editFields.title, description: editFields.description }),
      });
      fetchGcalEvents(currentDate);
      setEditingDetail(false);
      setDetailEvent(null);
    } catch {}
  }

  function openDetail(source: "gcal" | "manual" | "task", id: string, title: string, time?: string, description?: string, colorId?: string) {
    setDetailEvent({ source, id, title, time, description, colorId });
    setEditFields({ title, description: description ?? "" });
    setEditingDetail(false);
  }

  /* --- Task pill color --- */
  function taskPillClass(task: any) {
    const due = task.dueDate?.split?.("T")?.[0] ?? task.dueDate;
    if (due < todayKey && task.status !== "done") return "bg-red-500 text-white";
    if (task.priority === "urgent" || task.priority === "high") return "bg-orange-500 text-white";
    return "bg-brand-gold text-brand-dark";
  }

  /* --- Render pills for a date key --- */
  function renderDayContent(dateKey: string, compact = false) {
    const dayTasks = tasksByDate.get(dateKey) ?? [];
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    const dayGcal = gcalByDate.get(dateKey) ?? [];
    const holiday = HOLIDAY_MAP.get(dateKey);

    return (
      <div className="mt-1 flex flex-col gap-0.5">
        {holiday && (
          <span className="truncate rounded px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
            {holiday}
          </span>
        )}
        {dayTasks.map((t: any) => (
          <button
            key={t.id}
            onClick={(e) => { e.stopPropagation(); openDetail("task", t.id, t.title, t.dueDate); }}
            className={`truncate rounded px-1.5 py-0.5 text-xs font-medium text-right w-full ${taskPillClass(t)}`}
            title={t.title}
          >
            {compact ? "" : t.title}
          </button>
        ))}
        {dayEvents.map((e) => (
          <button
            key={e.id}
            onClick={(ev) => { ev.stopPropagation(); openDetail("manual", e.id, e.title, e.startTime ? `${e.startTime}–${e.endTime}` : undefined, e.description); }}
            className="truncate rounded bg-green-500 px-1.5 py-0.5 text-xs font-medium text-white text-right w-full"
            title={e.title}
          >
            {compact ? "" : e.title}
          </button>
        ))}
        {dayGcal.map((ge) => (
          <button
            key={ge.id}
            onClick={(ev) => { ev.stopPropagation(); openDetail("gcal", ge.id, ge.title, ge.start, ge.description, ge.colorId); }}
            className={`truncate rounded px-1.5 py-0.5 text-xs font-medium text-white text-right w-full ${ge.colorId ? GCAL_COLOR_MAP[ge.colorId] ?? "bg-blue-500" : "bg-blue-500"}`}
            title={ge.title}
          >
            {compact ? "" : ge.title}
          </button>
        ))}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Monthly grid                                                     */
  /* ---------------------------------------------------------------- */

  function renderMonthlyView() {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const cells: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="rounded-lg border border-brand-border bg-brand-light overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-7">
          {DAYS_HE.map((day) => (
            <div
              key={day}
              className="border-b border-brand-border bg-brand-bg px-2 py-2 text-center text-xs font-semibold text-brand-muted"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((dayNum, idx) => {
            if (dayNum === null) {
              return <div key={`empty-${idx}`} className="min-h-[100px] border border-brand-border/50 p-2" />;
            }
            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const isToday = dateKey === todayKey;

            return (
              <div
                key={dateKey}
                className={`min-h-[100px] border p-2 ${
                  isToday ? "border-brand-gold bg-brand-gold/10" : "border-brand-border/50"
                }`}
              >
                <span className={`text-xs font-medium ${isToday ? "text-brand-gold" : "text-brand-dark"}`}>
                  {dayNum}
                </span>
                {renderDayContent(dateKey)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Weekly view                                                      */
  /* ---------------------------------------------------------------- */

  function renderWeeklyView() {
    const weekDates = getWeekDates(currentDate);

    return (
      <div className="rounded-lg border border-brand-border bg-brand-light overflow-hidden">
        <div className="grid grid-cols-7">
          {weekDates.map((d, i) => {
            const dateKey = formatDateKey(d);
            const isToday = dateKey === todayKey;
            const dayTasks = tasksByDate.get(dateKey) ?? [];
            const dayEvents = eventsByDate.get(dateKey) ?? [];
            const holiday = HOLIDAY_MAP.get(dateKey);

            return (
              <div
                key={dateKey}
                className={`min-h-[300px] border p-3 ${
                  isToday ? "border-brand-gold bg-brand-gold/10" : "border-brand-border/50"
                }`}
              >
                <div className="mb-2 text-center">
                  <div className="text-xs font-semibold text-brand-muted">{DAYS_HE[i]}</div>
                  <div className={`text-lg font-bold ${isToday ? "text-brand-gold" : "text-brand-dark"}`}>
                    {d.getDate()}
                  </div>
                </div>

                {holiday && (
                  <div className="mb-1 rounded px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300 text-center">
                    {holiday}
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  {dayTasks.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => openDetail("task", t.id, t.title, t.dueDate)}
                      className={`rounded px-2 py-1 text-xs font-medium text-right w-full ${taskPillClass(t)}`}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => openDetail("manual", e.id, e.title, e.startTime ? `${e.startTime}–${e.endTime}` : undefined, e.description)}
                      className="rounded bg-green-500 px-2 py-1 text-xs font-medium text-white text-right w-full"
                      title={e.title}
                    >
                      <span className="opacity-70">{e.type}</span> {e.title}
                    </button>
                  ))}
                  {(gcalByDate.get(dateKey) ?? []).map((ge) => (
                    <button
                      key={ge.id}
                      onClick={() => openDetail("gcal", ge.id, ge.title, ge.start, ge.description, ge.colorId)}
                      className={`rounded px-2 py-1 text-xs font-medium text-white text-right w-full ${ge.colorId ? GCAL_COLOR_MAP[ge.colorId] ?? "bg-blue-500" : "bg-blue-500"}`}
                      title={ge.title}
                    >
                      {ge.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Daily view                                                       */
  /* ---------------------------------------------------------------- */

  function renderDailyView() {
    const dateKey = formatDateKey(currentDate);
    const dayTasks = tasksByDate.get(dateKey) ?? [];
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    const dayGcal = gcalByDate.get(dateKey) ?? [];
    const holiday = HOLIDAY_MAP.get(dateKey);
    const isToday = dateKey === todayKey;

    function getHourForTime(timeStr: string): number {
      if (!timeStr) return -1;
      const t = timeStr.includes("T") ? timeStr.split("T")[1] : timeStr;
      const h = parseInt(t?.split(":")[0] ?? "-1", 10);
      return h;
    }

    return (
      <div className="rounded-lg border border-brand-border bg-brand-light overflow-hidden">
        {/* Day header */}
        <div className={`border-b border-brand-border p-4 text-center ${isToday ? "bg-brand-gold/10" : "bg-brand-bg"}`}>
          <div className="text-xs font-semibold text-brand-muted">{DAYS_HE[currentDate.getDay()]}</div>
          <div className={`text-2xl font-bold ${isToday ? "text-brand-gold" : "text-brand-dark"}`}>{currentDate.getDate()}</div>
          <div className="text-sm text-brand-muted">{MONTHS_HE[month]} {year}</div>
          {holiday && (
            <span className="mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
              {holiday}
            </span>
          )}
        </div>

        {/* All-day events */}
        {(() => {
          function getHourForTimeAllDay(timeStr: string): number {
            if (!timeStr) return -1;
            const t = timeStr.includes("T") ? timeStr.split("T")[1] : timeStr;
            return parseInt(t?.split(":")[0] ?? "-1", 10);
          }
          const noHourTasks = dayTasks.filter((t: any) => getHourForTimeAllDay(t.dueDate) < 6);
          const noHourEvents = dayEvents.filter((e) => !e.startTime || getHourForTimeAllDay(e.startTime) < 6);
          const noHourGcal = dayGcal.filter((ge) => ge.allDay || getHourForTimeAllDay(ge.start) < 6);
          if (noHourTasks.length === 0 && noHourEvents.length === 0 && noHourGcal.length === 0) return null;
          return (
            <div className="border-b border-brand-border bg-brand-bg/50 p-2">
              <div className="mb-1 text-xs font-semibold text-brand-muted">כל היום</div>
              <div className="flex flex-wrap gap-1">
                {noHourTasks.map((t: any) => (
                  <button key={t.id} onClick={() => openDetail("task", t.id, t.title, t.dueDate)} className={`rounded px-2 py-1 text-xs font-medium ${taskPillClass(t)}`}>{t.title}</button>
                ))}
                {noHourEvents.map((e) => (
                  <button key={e.id} onClick={() => openDetail("manual", e.id, e.title, undefined, e.description)} className="rounded bg-green-500 px-2 py-1 text-xs font-medium text-white">{e.title}</button>
                ))}
                {noHourGcal.map((ge) => (
                  <button key={ge.id} onClick={() => openDetail("gcal", ge.id, ge.title, ge.start, ge.description, ge.colorId)} className={`rounded px-2 py-1 text-xs font-medium text-white ${ge.colorId ? GCAL_COLOR_MAP[ge.colorId] ?? "bg-blue-500" : "bg-blue-500"}`}>{ge.title}</button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Hour grid — scrollable, starts at 07:00 */}
        <div className="relative max-h-[600px] overflow-y-auto" ref={(el) => { if (el && !el.dataset.scrolled) { el.scrollTop = 7 * 52; el.dataset.scrolled = "1"; } }}>
          {HOURS.map((hour) => {
            const hourStr = String(hour).padStart(2, "0");
            const hourTasks = dayTasks.filter((t: any) => {
              const h = getHourForTime(t.dueDate);
              return h === hour;
            });
            const hourEvents = dayEvents.filter((e) => {
              const h = getHourForTime(e.startTime ?? "");
              return h === hour;
            });
            const hourGcal = dayGcal.filter((ge) => {
              const h = getHourForTime(ge.start);
              return h === hour;
            });

            return (
              <div key={hour} className="flex min-h-[52px] border-b border-brand-border/50">
                {/* Hour label on the right (RTL) */}
                <div className="flex w-16 shrink-0 items-start justify-center border-l border-brand-border/50 bg-brand-bg pt-1 text-xs font-medium text-brand-muted">
                  {hourStr}:00
                </div>
                {/* Events area */}
                <div className="flex flex-1 flex-wrap items-start gap-1 p-1">
                  {hourTasks.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => openDetail("task", t.id, t.title, t.dueDate)}
                      className={`rounded px-2 py-1 text-xs font-medium ${taskPillClass(t)}`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {hourEvents.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => openDetail("manual", e.id, e.title, e.startTime ? `${e.startTime}–${e.endTime}` : undefined, e.description)}
                      className="rounded bg-green-500 px-2 py-1 text-xs font-medium text-white"
                    >
                      {e.startTime}–{e.endTime} {e.title}
                    </button>
                  ))}
                  {hourGcal.map((ge) => (
                    <button
                      key={ge.id}
                      onClick={() => openDetail("gcal", ge.id, ge.title, ge.start, ge.description, ge.colorId)}
                      className={`rounded px-2 py-1 text-xs font-medium text-white ${ge.colorId ? GCAL_COLOR_MAP[ge.colorId] ?? "bg-blue-500" : "bg-blue-500"}`}
                    >
                      {ge.start?.split("T")[1]?.slice(0, 5)} {ge.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Main render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-6 w-6 text-brand-gold" />
          <h1 className="text-2xl font-bold text-brand-dark">לוח שנה</h1>
        </div>
        <div className="flex items-center gap-2">
          {!gcalConnected ? (
            <button
              onClick={handleConnectGcal}
              className="flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-xs font-medium text-brand-dark hover:bg-brand-bg"
            >
              <Link2 className="h-3.5 w-3.5" />
              חבר Google Calendar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-green-50 px-2 py-1 text-[10px] text-green-700">
                מחובר — {gcalEmail}
              </span>
              <button
                onClick={async () => {
                  if (!confirm("האם אתה בטוח שברצונך לנתק את Google Calendar?")) return;
                  await fetch("/api/calendar/disconnect", { method: "DELETE" });
                  setGcalConnected(false);
                  setGcalEvents([]);
                  setGcalEmail("");
                }}
                className="rounded-lg border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50"
              >
                נתק יומן
              </button>
            </div>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
          >
            <Plus className="h-4 w-4" />
            הוסף אירוע
          </button>
        </div>
      </div>

      {/* View mode tabs + month/week navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex rounded-lg border border-brand-border overflow-hidden">
          {(["חודשי", "שבועי", "יומי"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-5 py-2 text-sm font-medium transition-colors ${
                viewMode === mode ? "bg-brand-gold text-brand-dark" : "bg-brand-bg text-brand-muted"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={viewMode === "חודשי" ? nextMonth : viewMode === "שבועי" ? nextWeek : nextDay}
            className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:bg-brand-bg"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="min-w-[140px] text-center text-sm font-semibold text-brand-dark">
            {viewMode === "חודשי"
              ? `${MONTHS_HE[month]} ${year}`
              : viewMode === "שבועי"
              ? (() => {
                  const weekDates = getWeekDates(currentDate);
                  return `${weekDates[0].getDate()}–${weekDates[6].getDate()} ${MONTHS_HE[weekDates[0].getMonth()]} ${weekDates[0].getFullYear()}`;
                })()
              : `${currentDate.getDate()} ${MONTHS_HE[month]} ${year}`}
          </span>

          <button
            onClick={viewMode === "חודשי" ? prevMonth : viewMode === "שבועי" ? prevWeek : prevDay}
            className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:bg-brand-bg"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-brand-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> Google Calendar</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> אירוע ידני</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-gold" /> משימה</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> משימה באיחור</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" /> משימה דחופה</span>
      </div>

      {/* Calendar grid */}
      {viewMode === "חודשי" ? renderMonthlyView() : viewMode === "שבועי" ? renderWeeklyView() : renderDailyView()}

      {/* Add event modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="אירוע חדש">
        <div className="space-y-4" dir="rtl">

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">כותרת</label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) => setNewEvent((p) => ({ ...p, title: e.target.value }))}
                placeholder="שם האירוע"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">תאריך</label>
              <input
                type="date"
                value={newEvent.date}
                onChange={(e) => setNewEvent((p) => ({ ...p, date: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">שעת התחלה</label>
                <input
                  type="time"
                  value={newEvent.startTime}
                  onChange={(e) => setNewEvent((p) => ({ ...p, startTime: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">שעת סיום</label>
                <input
                  type="time"
                  value={newEvent.endTime}
                  onChange={(e) => setNewEvent((p) => ({ ...p, endTime: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">סוג</label>
              <select
                value={newEvent.type}
                onChange={(e) => setNewEvent((p) => ({ ...p, type: e.target.value as ManualEvent["type"] }))}
                className={inputClass}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">תיאור</label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent((p) => ({ ...p, description: e.target.value }))}
                placeholder="פרטים נוספים..."
                rows={2}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">שיוך ללקוח</label>
              <select
                value={newEvent.clientId}
                onChange={(e) => setNewEvent((p) => ({ ...p, clientId: e.target.value }))}
                className={inputClass}
              >
                <option value="">ללא</option>
                {(clients ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">צבע</label>
                <select
                  value={newEvent.colorId}
                  onChange={(e) => setNewEvent((p) => ({ ...p, colorId: e.target.value }))}
                  className={inputClass}
                >
                  {COLOR_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">תזכורת</label>
                <select
                  value={newEvent.reminder}
                  onChange={(e) => setNewEvent((p) => ({ ...p, reminder: Number(e.target.value) }))}
                  className={inputClass}
                >
                  {REMINDER_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {gcalConnected && (
              <label className="flex items-center gap-2 text-sm text-brand-dark cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEvent.saveToGcal}
                  onChange={(e) => setNewEvent((p) => ({ ...p, saveToGcal: e.target.checked }))}
                  className="h-4 w-4 rounded border-brand-border text-brand-gold focus:ring-brand-gold"
                />
                שמור ב-Google Calendar
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowModal(false)}
              className="rounded-lg border border-brand-border bg-brand-bg px-4 py-2 text-sm font-medium text-brand-muted transition-colors hover:bg-brand-light"
            >
              ביטול
            </button>
            <button
              onClick={handleAddEvent}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
            >
              הוסף
            </button>
          </div>
        </div>
      </Modal>

      {/* Event detail panel */}
      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDetailEvent(null)}>
          <div
            dir="rtl"
            className="relative w-full max-w-md rounded-lg border border-brand-border bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setDetailEvent(null)} className="absolute left-3 top-3 text-brand-muted hover:text-brand-dark">
              <X className="h-4 w-4" />
            </button>

            {!editingDetail ? (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-brand-dark">{detailEvent.title}</h3>
                {detailEvent.time && (
                  <p className="text-sm text-brand-muted">
                    {detailEvent.time.includes("T") ? detailEvent.time.split("T")[1]?.slice(0, 5) : detailEvent.time}
                  </p>
                )}
                {detailEvent.description && (
                  <p className="text-sm text-brand-dark whitespace-pre-wrap">{detailEvent.description}</p>
                )}
                <div className="flex items-center gap-1 text-xs text-brand-muted">
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    detailEvent.source === "gcal" ? (detailEvent.colorId ? GCAL_COLOR_MAP[detailEvent.colorId] ?? "bg-blue-500" : "bg-blue-500")
                    : detailEvent.source === "manual" ? "bg-green-500" : "bg-brand-gold"
                  }`} />
                  {detailEvent.source === "gcal" ? "Google Calendar" : detailEvent.source === "manual" ? "אירוע ידני" : "משימה"}
                </div>

                {detailEvent.source === "gcal" && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditingDetail(true)}
                      className="flex items-center gap-1 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand-bg"
                    >
                      <Pencil className="h-3 w-3" /> ערוך
                    </button>
                    <button
                      onClick={() => handleDeleteGcalEvent(detailEvent.id)}
                      className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> מחק
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">כותרת</label>
                  <input
                    type="text"
                    value={editFields.title}
                    onChange={(e) => setEditFields((p) => ({ ...p, title: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-brand-dark">תיאור</label>
                  <textarea
                    value={editFields.description}
                    onChange={(e) => setEditFields((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleEditGcalEvent(detailEvent.id)}
                    className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-gold/80"
                  >
                    שמור
                  </button>
                  <button
                    onClick={() => setEditingDetail(false)}
                    className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted hover:bg-brand-bg"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
