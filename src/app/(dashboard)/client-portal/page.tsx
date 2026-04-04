"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useApp } from "@/lib/data/context";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, DollarSign, Target, Zap } from "lucide-react";

const cardClass =
  "rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm";

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-brand-success/10", text: "text-brand-success", label: "תקין" },
  at_risk: { bg: "bg-brand-warning/10", text: "text-brand-warning", label: "בסיכון" },
  upsell: { bg: "bg-brand-info/10", text: "text-brand-info", label: "מוכן לאפסייל" },
};

export default function ClientPortalPage() {
  const { data: session } = useSession();
  const { clients } = useApp();

  const myClient = clients[0];

  const chartData = useMemo(() => {
    const months = ["נוב", "דצמ", "ינו", "פבר", "מרץ", "אפר"];
    return months.map((m) => ({
      month: m,
      conversions: Math.floor(500 + Math.random() * 600),
      cost: Math.floor(30 + Math.random() * 30),
    }));
  }, []);

  if (!myClient) {
    return (
      <div dir="rtl" className="p-6">
        <p className="text-brand-muted">טוען נתונים...</p>
      </div>
    );
  }

  const { performance, monthlyBudget, optimizations } = myClient;
  const status = statusColors[myClient.status] ?? statusColors.active;
  const recentOptimizations = optimizations.slice(-5).reverse();

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Welcome header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">
          שלום {myClient.name}
        </h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${status.bg} ${status.text}`}
        >
          {status.label}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* תקציב חודשי */}
        <div className={cardClass}>
          <div className="mb-2 flex items-center gap-2 text-brand-muted">
            <DollarSign className="h-4 w-4 text-brand-gold" />
            <span className="text-sm">תקציב חודשי</span>
          </div>
          <p className="text-2xl font-semibold text-brand-dark">
            {performance.budgetUsed.toLocaleString("he-IL")}₪
          </p>
          <p className="mb-2 text-xs text-brand-muted">
            מתוך {monthlyBudget.toLocaleString("he-IL")}₪
          </p>
          <ProgressBar
            current={performance.budgetUsed}
            target={monthlyBudget}
            inverted
          />
        </div>

        {/* המרות */}
        <div className={cardClass}>
          <div className="mb-2 flex items-center gap-2 text-brand-muted">
            <Target className="h-4 w-4 text-brand-gold" />
            <span className="text-sm">המרות</span>
          </div>
          <p className="text-2xl font-semibold text-brand-dark">
            {performance.conversionsThisMonth.toLocaleString("he-IL")}
          </p>
          <p className="mb-2 text-xs text-brand-muted">
            יעד: {performance.targetConversions.toLocaleString("he-IL")}
          </p>
          <ProgressBar
            current={performance.conversionsThisMonth}
            target={performance.targetConversions}
          />
        </div>

        {/* עלות להמרה */}
        <div className={cardClass}>
          <div className="mb-2 flex items-center gap-2 text-brand-muted">
            <TrendingUp className="h-4 w-4 text-brand-gold" />
            <span className="text-sm">עלות להמרה</span>
          </div>
          <p className="text-2xl font-semibold text-brand-dark">
            {performance.avgCostPerConversion.toLocaleString("he-IL")}₪
          </p>
          <p className="mb-2 text-xs text-brand-muted">
            יעד: {performance.targetCostPerConversion.toLocaleString("he-IL")}₪
          </p>
          <ProgressBar
            current={performance.avgCostPerConversion}
            target={performance.targetCostPerConversion}
            inverted
          />
        </div>

        {/* אופטימיזציות */}
        <div className={cardClass}>
          <div className="mb-2 flex items-center gap-2 text-brand-muted">
            <Zap className="h-4 w-4 text-brand-gold" />
            <span className="text-sm">אופטימיזציות</span>
          </div>
          <p className="text-2xl font-semibold text-brand-dark">
            {optimizations.length}
          </p>
          <p className="text-xs text-brand-muted">סה״כ אופטימיזציות</p>
        </div>
      </div>

      {/* Chart */}
      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">
            מגמות ביצועים
          </h2>
          <span className="rounded-full bg-brand-warning/10 px-3 py-1 text-xs font-medium text-brand-warning">
            נתוני דמו
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} reversed />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="left" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="conversions"
              stroke="#eed89b"
              strokeWidth={2}
              name="המרות"
              dot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cost"
              stroke="#ef4444"
              strokeWidth={2}
              name="עלות להמרה"
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Optimizations */}
        <div className={cardClass}>
          <h2 className="mb-4 text-lg font-semibold text-brand-dark">
            אופטימיזציות אחרונות
          </h2>
          {recentOptimizations.length === 0 ? (
            <p className="text-sm text-brand-muted">אין אופטימיזציות עדיין</p>
          ) : (
            <div className="space-y-4">
              {recentOptimizations.map((opt) => (
                <div
                  key={opt.id}
                  className="border-r-2 border-brand-gold pr-4"
                >
                  <p className="text-sm font-medium text-brand-dark">
                    {opt.description}
                  </p>
                  <p className="text-xs text-brand-muted">{opt.date}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Goals */}
        <div className={cardClass}>
          <h2 className="mb-4 text-lg font-semibold text-brand-dark">
            עמידה ביעדים
          </h2>
          <div className="space-y-5">
            {/* Budget goal */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-brand-dark">תקציב</span>
                <span className="text-xs text-brand-muted">
                  {performance.budgetUsed.toLocaleString("he-IL")}₪ /{" "}
                  {monthlyBudget.toLocaleString("he-IL")}₪
                </span>
              </div>
              <ProgressBar
                current={performance.budgetUsed}
                target={monthlyBudget}
                inverted
              />
            </div>

            {/* Conversions goal */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-brand-dark">המרות</span>
                <span className="text-xs text-brand-muted">
                  {performance.conversionsThisMonth.toLocaleString("he-IL")} /{" "}
                  {performance.targetConversions.toLocaleString("he-IL")}
                </span>
              </div>
              <ProgressBar
                current={performance.conversionsThisMonth}
                target={performance.targetConversions}
              />
            </div>

            {/* Cost per conversion goal */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-brand-dark">עלות להמרה</span>
                <span className="text-xs text-brand-muted">
                  {performance.avgCostPerConversion.toLocaleString("he-IL")}₪ /{" "}
                  {performance.targetCostPerConversion.toLocaleString("he-IL")}₪
                </span>
              </div>
              <ProgressBar
                current={performance.avgCostPerConversion}
                target={performance.targetCostPerConversion}
                inverted
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
