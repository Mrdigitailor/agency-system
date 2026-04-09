"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useApp } from "@/lib/data/context";
import Modal from "@/components/ui/Modal";
import { ChevronRight, ChevronLeft, Plus, Calendar, Link2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

interface ManualEvent {
  id: string;
  title: string;
  date: string;
  type: "פגישה" | "שיחה" | "אחר";
}

type ViewMode = "חודשי" | "שבועי";

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
  const [newEvent, setNewEvent] = useState({ title: "", date: "", type: "פגישה" as ManualEvent["type"] });

  // Google Calendar
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalEvents, setGcalEvents] = useState<Array<{ id: string; title: string; start: string; end: string; allDay: boolean }>>([]);
  const [gcalEmail, setGcalEmail] = useState("");

  const fetchGcalEvents = useCallback(async (date: Date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59).toISOString();
    try {
      const res = await fetch(`/api/calendar/events?timeMin=${start}&timeMax=${end}`);
      const data = await res.json();
      setGcalConnected(data.connected);
      setGcalEvents(data.events ?? []);
      if (data.email) setGcalEmail(data.email);
    } catch {}
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

  /* --- Add event handler --- */
  function handleAddEvent() {
    if (!newEvent.title || !newEvent.date) return;
    setEvents((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: newEvent.title, date: newEvent.date, type: newEvent.type },
    ]);
    setNewEvent({ title: "", date: "", type: "פגישה" });
    setShowModal(false);
  }

  /* --- Task pill color --- */
  function taskPillClass(task: any) {
    const due = task.dueDate?.split?.("T")?.[0] ?? task.dueDate;
    if (due < todayKey && task.status !== "done") return "bg-red-500 text-white";
    if (task.priority === "urgent" || task.priority === "high") return "bg-orange-400 text-white";
    return "bg-blue-500 text-white";
  }

  /* --- Render pills for a date key --- */
  function renderDayContent(dateKey: string, compact = false) {
    const dayTasks = tasksByDate.get(dateKey) ?? [];
    const dayEvents = eventsByDate.get(dateKey) ?? [];
    const holiday = HOLIDAY_MAP.get(dateKey);

    return (
      <div className="mt-1 flex flex-col gap-0.5">
        {holiday && (
          <span className="truncate rounded px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
            {holiday}
          </span>
        )}
        {dayTasks.map((t: any) => (
          <span
            key={t.id}
            className={`truncate rounded px-1.5 py-0.5 text-xs font-medium ${taskPillClass(t)}`}
            title={t.title}
          >
            {compact ? "" : t.title}
          </span>
        ))}
        {dayEvents.map((e) => (
          <span
            key={e.id}
            className="truncate rounded bg-green-500 px-1.5 py-0.5 text-xs font-medium text-white"
            title={e.title}
          >
            {compact ? "" : e.title}
          </span>
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
                    <div
                      key={t.id}
                      className={`rounded px-2 py-1 text-xs font-medium ${taskPillClass(t)}`}
                      title={t.title}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className="rounded bg-green-500 px-2 py-1 text-xs font-medium text-white"
                      title={e.title}
                    >
                      <span className="opacity-70">{e.type}</span> {e.title}
                    </div>
                  ))}
                  {(gcalByDate.get(dateKey) ?? []).map((ge) => (
                    <div
                      key={ge.id}
                      className="rounded bg-purple-500 px-2 py-1 text-xs font-medium text-white"
                      title={ge.title}
                    >
                      📅 {ge.title}
                    </div>
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
            <span className="rounded-lg bg-green-50 px-2 py-1 text-[10px] text-green-700">
              מחובר — {gcalEmail}
            </span>
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
          {(["חודשי", "שבועי"] as ViewMode[]).map((mode) => (
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
            onClick={viewMode === "חודשי" ? nextMonth : nextWeek}
            className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:bg-brand-bg"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="min-w-[140px] text-center text-sm font-semibold text-brand-dark">
            {viewMode === "חודשי"
              ? `${MONTHS_HE[month]} ${year}`
              : (() => {
                  const weekDates = getWeekDates(currentDate);
                  return `${weekDates[0].getDate()}–${weekDates[6].getDate()} ${MONTHS_HE[weekDates[0].getMonth()]} ${weekDates[0].getFullYear()}`;
                })()}
          </span>

          <button
            onClick={viewMode === "חודשי" ? prevMonth : prevWeek}
            className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:bg-brand-bg"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      {viewMode === "חודשי" ? renderMonthlyView() : renderWeeklyView()}

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
    </div>
  );
}
