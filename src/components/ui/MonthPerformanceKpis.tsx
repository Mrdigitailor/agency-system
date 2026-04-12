"use client";

import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";

interface Props {
  currency?: string;
  monthlyBudget: number;
  spent: number;
  conversions: number;
  targetConversions: number;
  costPerConversion: number;
  targetCostPerConversion: number;
  metaSpend?: number;
  metaConversions?: number;
  gadsSpend?: number;
  gadsConversions?: number;
}

/**
 * תאריך נוכחי — מספר ימים שעברו וימים שנותרו בחודש
 */
function getMonthProgress() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const daysElapsed = day;
  const daysRemaining = Math.max(0, totalDays - day);
  const monthPct = totalDays > 0 ? (daysElapsed / totalDays) * 100 : 0;
  return { totalDays, daysElapsed, daysRemaining, monthPct };
}

/** מסווג לפי פער מהקצב המתוכנן */
function paceColor(actualPct: number, expectedPct: number): "success" | "warning" | "danger" {
  const diff = actualPct - expectedPct;
  if (Math.abs(diff) <= 10) return "success";
  if (Math.abs(diff) <= 20) return "warning";
  return "danger";
}

const COLOR_CLASSES = {
  success: { bar: "bg-brand-success", text: "text-brand-success", border: "border-brand-success/30", bg: "bg-brand-success/10" },
  warning: { bar: "bg-brand-warning", text: "text-brand-warning", border: "border-brand-warning/30", bg: "bg-brand-warning/10" },
  danger: { bar: "bg-brand-danger", text: "text-brand-danger", border: "border-brand-danger/30", bg: "bg-brand-danger/10" },
};

export default function MonthPerformanceKpis({
  currency,
  monthlyBudget,
  spent,
  conversions,
  targetConversions,
  costPerConversion,
  targetCostPerConversion,
  metaSpend,
  metaConversions,
  gadsSpend,
  gadsConversions,
}: Props) {
  const hasBreakdown = (metaSpend ?? 0) > 0 || (gadsSpend ?? 0) > 0;
  const { totalDays, daysElapsed, daysRemaining, monthPct } = getMonthProgress();

  /* ============ קוביית תקציב ============ */
  const budgetPct = monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0;
  const budgetColor = paceColor(budgetPct, monthPct);
  const budgetClasses = COLOR_CLASSES[budgetColor];
  const budgetRemaining = Math.max(0, monthlyBudget - spent);
  const dailyBudgetNeeded = daysRemaining > 0 ? budgetRemaining / daysRemaining : 0;

  /* ============ קוביית עלות להמרה ============ */
  const cpcDiff = costPerConversion - targetCostPerConversion;
  const cpcGood = targetCostPerConversion > 0 && costPerConversion > 0 && costPerConversion <= targetCostPerConversion;
  const cpcBad = targetCostPerConversion > 0 && costPerConversion > targetCostPerConversion;
  // מיקום נקודות על סקאלה ויזואלית: 0 → 200% מהיעד
  const cpcMaxScale = targetCostPerConversion * 2 || 1;
  const targetPos = targetCostPerConversion > 0 ? Math.min(100, (targetCostPerConversion / cpcMaxScale) * 100) : 50;
  const actualPos = costPerConversion > 0 ? Math.min(100, (costPerConversion / cpcMaxScale) * 100) : 0;

  /* ============ קוביית המרות ============ */
  const convPct = targetConversions > 0 ? (conversions / targetConversions) * 100 : 0;
  const convColor = paceColor(convPct, monthPct);
  const convClasses = COLOR_CLASSES[convColor];
  const conversionsRemaining = Math.max(0, targetConversions - conversions);
  const dailyConversionsNeeded = daysRemaining > 0 ? Math.ceil(conversionsRemaining / daysRemaining) : 0;

  return (
    <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
          <TrendingUp className="h-5 w-5 text-brand-muted" />
          ביצועי החודש
        </h2>
        <p className="text-xs text-brand-muted">
          יום {daysElapsed} מתוך {totalDays} · {Math.round(monthPct)}% מהחודש עבר
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ============ קוביית תקציב ============ */}
        <div className={`rounded-lg border ${budgetClasses.border} ${budgetClasses.bg} p-4`}>
          <p className="text-xs font-medium text-brand-muted">תקציב שנוצל</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {formatCurrency(spent, currency)}
            <span className="text-sm font-normal text-brand-muted"> / {formatCurrency(monthlyBudget, currency)}</span>
          </p>
          <p className={`text-xs font-medium ${budgetClasses.text}`}>{Math.round(budgetPct)}% ניצול</p>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-brand-border/60">
            <div
              className={`h-full rounded-full ${budgetClasses.bar} transition-all`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
            />
          </div>

          <div className="mt-3 border-t border-brand-border/60 pt-2">
            <p className="text-xs text-brand-muted">תקציב יומי נדרש</p>
            <p className="text-sm font-semibold text-brand-dark">
              {formatCurrency(dailyBudgetNeeded, currency)}
              <span className="text-xs font-normal text-brand-muted"> · {daysRemaining} ימים נותרו</span>
            </p>
          </div>
          {hasBreakdown && (
            <div className="mt-2 border-t border-brand-border/60 pt-2 text-[11px] text-brand-muted">
              {(metaSpend ?? 0) > 0 && <span>Meta: {formatCurrency(metaSpend ?? 0, currency)}</span>}
              {(metaSpend ?? 0) > 0 && (gadsSpend ?? 0) > 0 && <span> · </span>}
              {(gadsSpend ?? 0) > 0 && <span>Google: {formatCurrency(gadsSpend ?? 0, currency)}</span>}
            </div>
          )}
        </div>

        {/* ============ קוביית עלות להמרה ============ */}
        <div className={`rounded-lg border p-4 ${cpcGood ? COLOR_CLASSES.success.border + " " + COLOR_CLASSES.success.bg : cpcBad ? COLOR_CLASSES.danger.border + " " + COLOR_CLASSES.danger.bg : "border-brand-border bg-brand-bg"}`}>
          <p className="text-xs font-medium text-brand-muted">עלות להמרה</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {formatCurrency(costPerConversion, currency)}
          </p>
          {targetCostPerConversion > 0 && costPerConversion > 0 && (
            <p className={`text-xs font-medium ${cpcGood ? COLOR_CLASSES.success.text : COLOR_CLASSES.danger.text}`}>
              {formatCurrency(Math.abs(cpcDiff), currency)} {cpcGood ? "מתחת ליעד" : "מעל היעד"}
            </p>
          )}
          {(targetCostPerConversion === 0 || costPerConversion === 0) && (
            <p className="text-xs text-brand-muted">יעד: {formatCurrency(targetCostPerConversion, currency)}</p>
          )}

          {/* בר עם שתי נקודות */}
          <div className="mt-4">
            <div className="relative h-2.5 w-full rounded-full bg-brand-border/60">
              {/* קו יעד */}
              {targetCostPerConversion > 0 && (
                <div
                  className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-brand-dark"
                  style={{ right: `${targetPos}%` }}
                />
              )}
              {/* נקודה נוכחית */}
              {costPerConversion > 0 && (
                <div
                  className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-brand-light ${cpcGood ? "bg-brand-success" : "bg-brand-danger"}`}
                  style={{ right: `${actualPos}%` }}
                />
              )}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-brand-muted">
              <span>0</span>
              <span className="font-semibold text-brand-dark">יעד {formatCurrency(targetCostPerConversion, currency)}</span>
              <span>{formatCurrency(cpcMaxScale, currency)}</span>
            </div>
          </div>
        </div>

        {/* ============ קוביית המרות ============ */}
        <div className={`rounded-lg border ${convClasses.border} ${convClasses.bg} p-4`}>
          <p className="text-xs font-medium text-brand-muted">המרות החודש</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {conversions.toLocaleString()}
            <span className="text-sm font-normal text-brand-muted"> / {targetConversions.toLocaleString()}</span>
          </p>
          <p className={`text-xs font-medium ${convClasses.text}`}>{Math.round(convPct)}% מהיעד</p>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-brand-border/60">
            <div
              className={`h-full rounded-full ${convClasses.bar} transition-all`}
              style={{ width: `${Math.min(convPct, 100)}%` }}
            />
          </div>

          <div className="mt-3 border-t border-brand-border/60 pt-2">
            <p className="text-xs text-brand-muted">נדרש ליום עד סוף החודש</p>
            <p className="text-sm font-semibold text-brand-dark">
              {dailyConversionsNeeded.toLocaleString()} המרות
              <span className="text-xs font-normal text-brand-muted"> · {daysRemaining} ימים נותרו</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
