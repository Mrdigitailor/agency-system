"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, X, Clock, User } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  clientId?: string;
  clientName?: string;
}

interface MeetingReminderProps {
  events: CalendarEvent[];
}

export default function MeetingReminder({ events }: MeetingReminderProps) {
  const [activeReminder, setActiveReminder] = useState<CalendarEvent | null>(null);
  const [minutesLeft, setMinutesLeft] = useState(0);
  const [snoozed, setSnoozed] = useState(false);

  const checkReminders = useCallback(() => {
    const now = Date.now();
    const dismissed = JSON.parse(localStorage.getItem("dismissedReminders") ?? "[]") as string[];

    for (const event of events) {
      if (!event.start || event.start.length < 11) continue; // skip all-day
      const eventTime = new Date(event.start).getTime();
      const diff = eventTime - now;
      const minutes = Math.floor(diff / 60000);

      // הצג 15 דקות לפני (או 5 דקות אם snooze)
      const threshold = snoozed ? 5 : 15;
      if (minutes >= 0 && minutes <= threshold && !dismissed.includes(event.id)) {
        setActiveReminder(event);
        setMinutesLeft(minutes);

        // צליל התראה
        try {
          const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGY/OVmEo8y5f0s+V32bt7WRY0Y+");
          audio.volume = 0.3;
          audio.play().catch(() => {});
        } catch {}

        return;
      }
    }
  }, [events, snoozed]);

  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, 60000); // כל דקה
    return () => clearInterval(interval);
  }, [checkReminders]);

  const dismiss = () => {
    if (!activeReminder) return;
    const dismissed = JSON.parse(localStorage.getItem("dismissedReminders") ?? "[]") as string[];
    dismissed.push(activeReminder.id);
    localStorage.setItem("dismissedReminders", JSON.stringify(dismissed));
    setActiveReminder(null);
    setSnoozed(false);
  };

  const snooze = () => {
    setActiveReminder(null);
    setSnoozed(true);
  };

  if (!activeReminder) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-sm animate-bounce rounded-lg border-2 border-brand-gold bg-brand-gold/95 p-6 shadow-2xl" style={{ animationIterationCount: 3, animationDuration: "0.5s" }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-6 w-6 text-brand-dark" />
            <h3 className="text-lg font-bold text-brand-dark">
              פגישה בעוד {minutesLeft} דקות!
            </h3>
          </div>
          <button onClick={dismiss} className="text-brand-dark/50 hover:text-brand-dark">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-base font-semibold text-brand-dark">{activeReminder.title}</p>
          <div className="flex items-center gap-2 text-sm text-brand-dark/70">
            <Clock className="h-4 w-4" />
            <span>{new Date(activeReminder.start).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {activeReminder.clientName && (
            <div className="flex items-center gap-2 text-sm text-brand-dark/70">
              <User className="h-4 w-4" />
              <span>{activeReminder.clientName}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={dismiss}
            className="flex-1 rounded-lg bg-brand-dark px-4 py-2 text-sm font-medium text-brand-gold transition-colors hover:bg-brand-dark/90"
          >
            הבנתי
          </button>
          <button
            onClick={snooze}
            className="rounded-lg border border-brand-dark/20 px-4 py-2 text-sm font-medium text-brand-dark transition-colors hover:bg-brand-gold/80"
          >
            הזכר בעוד 5 דק׳
          </button>
        </div>
      </div>
    </div>
  );
}
