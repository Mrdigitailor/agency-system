"use client";

import { useState } from "react";
import { TrendingUp, SlidersHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import ConversionManager, { type CampaignResult } from "@/components/ui/ConversionManager";

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
  ttSpend?: number;
  ttConversions?: number;
  /** פירוק המרות פר-פלטפורמה לפי סוג — ל-tooltip שקיפות */
  conversionBreakdown?: {
    meta?: Array<{ label: string; count: number }>;
    google?: Array<{ label: string; count: number }>;
    tiktok?: Array<{ label: string; count: number }>;
  };
  /** תוצאות פר-קמפיין (מטא) + ניהול החרגות — למנהלים */
  clientId?: string;
  metaCampaignResults?: CampaignResult[];
  onExclusionsChanged?: () => void;
  lastSyncAt?: string | null;
}

/** שם פלטפורמה + כמות המרות, עם tooltip בריחוף שמפרט את סוגי ההמרות שנספרו */
function ConvChip({ name, count, items }: { name: string; count: number; items?: Array<{ label: string; count: number }> }) {
  return (
    <span className="group relative cursor-help border-b border-dotted border-brand-muted/40">
      {name}: {count.toLocaleString()}
      {items && items.length > 0 && (
        <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 hidden w-max min-w-[180px] max-w-[240px] rounded-lg border border-brand-border bg-brand-light p-2.5 text-right text-[11px] shadow-lg group-hover:block">
          <span className="mb-1 block font-semibold text-brand-dark">{name} — {count.toLocaleString()} המרות לפי סוג:</span>
          {items.map((it, i) => (
            <span key={i} className="flex justify-between gap-3 py-0.5 text-brand-muted">
              <span className="truncate">{it.label}</span>
              <span className="shrink-0 font-medium text-brand-dark">{it.count.toLocaleString()}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
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
  ttSpend,
  ttConversions,
  conversionBreakdown,
  clientId,
  metaCampaignResults,
  onExclusionsChanged,
  lastSyncAt,
}: Props) {
  const { t } = useLanguage();
  const [managerOpen, setManagerOpen] = useState(false);
  const hasBreakdown = (metaSpend ?? 0) > 0 || (gadsSpend ?? 0) > 0 || (ttSpend ?? 0) > 0;
  const { totalDays, daysElapsed, daysRemaining, monthPct } = getMonthProgress();

  /* ============ קוביית תקציב ============ */
  const budgetPct = monthlyBudget > 0 ? (spent / monthlyBudget) * 100 : 0;
  const budgetColor = paceColor(budgetPct, monthPct);
  const budgetClasses = COLOR_CLASSES[budgetColor];
  const budgetRemaining = Math.max(0, monthlyBudget - spent);
  const dailyBudgetNeeded = daysRemaining > 0 ? budgetRemaining / daysRemaining : 0;

  /* ============ קוביית עלות להמרה ============ */
  // ירוק עד היעד, כתום בחריגה עד 25%, אדום מעל (עקבי עם טאב הלקוחות)
  const cpcDiff = costPerConversion - targetCostPerConversion;
  const cpcGood = targetCostPerConversion > 0 && costPerConversion > 0 && costPerConversion <= targetCostPerConversion;
  const cpcWarn = targetCostPerConversion > 0 && costPerConversion > targetCostPerConversion && costPerConversion <= targetCostPerConversion * 1.25;
  const cpcColor: "success" | "warning" | "danger" = cpcGood ? "success" : cpcWarn ? "warning" : "danger";
  const cpcClasses = COLOR_CLASSES[cpcColor];
  // מיקום נקודות על סקאלה ויזואלית: 0 → 200% מהיעד
  const cpcMaxScale = targetCostPerConversion * 2 || 1;
  const targetPos = targetCostPerConversion > 0 ? Math.min(100, (targetCostPerConversion / cpcMaxScale) * 100) : 50;
  const actualPos = costPerConversion > 0 ? Math.min(100, (costPerConversion / cpcMaxScale) * 100) : 0;

  /* ============ קוביית המרות ============ */
  // עקיפת היעד = הישג (ירוק), לא חריגה. מתחת ליעד — צבע לפי קצב מול החודש.
  const convPct = targetConversions > 0 ? (conversions / targetConversions) * 100 : 0;
  const hitConvGoal = targetConversions > 0 && conversions >= targetConversions;
  const convColor: "success" | "warning" | "danger" = hitConvGoal
    ? "success"
    : monthPct > 0 && convPct >= monthPct * 0.9
      ? "success"
      : monthPct > 0 && convPct >= monthPct * 0.7
        ? "warning"
        : "danger";
  const convClasses = COLOR_CLASSES[convColor];
  const conversionsRemaining = Math.max(0, targetConversions - conversions);
  const dailyConversionsNeeded = daysRemaining > 0 ? Math.ceil(conversionsRemaining / daysRemaining) : 0;

  return (
    <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-dark">
          <TrendingUp className="h-5 w-5 text-brand-muted" />
          {t('monthPerformance')}
        </h2>
        <p className="text-xs text-brand-muted">
          {t('day')} {daysElapsed} {t('outOf')} {totalDays} · {Math.round(monthPct)}% {t('ofMonthPassed')}
          {lastSyncAt && (
            <span className="mr-2">
              · {t('lastSync')} {new Date(lastSyncAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ============ קוביית תקציב ============ */}
        <div className={`rounded-lg border ${budgetClasses.border} ${budgetClasses.bg} p-4`}>
          <p className="text-xs font-medium text-brand-muted">{t('budgetUsed')}</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {formatCurrency(spent, currency)}
            <span className="text-sm font-normal text-brand-muted"> / {formatCurrency(monthlyBudget, currency)}</span>
          </p>
          <p className={`text-xs font-medium ${budgetClasses.text}`}>{Math.round(budgetPct)}% {t('utilization')}</p>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-brand-border/60">
            <div
              className={`h-full rounded-full ${budgetClasses.bar} transition-all`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
            />
          </div>

          <div className="mt-3 border-t border-brand-border/60 pt-2">
            <p className="text-xs text-brand-muted">{t('dailyBudgetNeeded')}</p>
            <p className="text-sm font-semibold text-brand-dark">
              {formatCurrency(dailyBudgetNeeded, currency)}
              <span className="text-xs font-normal text-brand-muted"> · {daysRemaining} {t('daysRemaining')}</span>
            </p>
          </div>
          {hasBreakdown && (
            <div className="mt-2 border-t border-brand-border/60 pt-2 text-[11px] text-brand-muted">
              {(metaSpend ?? 0) > 0 && <span>Meta: {formatCurrency(metaSpend ?? 0, currency)}</span>}
              {(metaSpend ?? 0) > 0 && (gadsSpend ?? 0) > 0 && <span> · </span>}
              {(gadsSpend ?? 0) > 0 && <span>Google: {formatCurrency(gadsSpend ?? 0, currency)}</span>}
              {(gadsSpend ?? 0) > 0 && (ttSpend ?? 0) > 0 && <span> · </span>}
              {(ttSpend ?? 0) > 0 && <span>TikTok: {formatCurrency(ttSpend ?? 0, currency)}</span>}
            </div>
          )}
        </div>

        {/* ============ קוביית עלות להמרה ============ */}
        <div className={`rounded-lg border p-4 ${targetCostPerConversion > 0 && costPerConversion > 0 ? `${cpcClasses.border} ${cpcClasses.bg}` : "border-brand-border bg-brand-bg"}`}>
          <p className="text-xs font-medium text-brand-muted">{t('costPerConversion')}</p>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {formatCurrency(costPerConversion, currency)}
          </p>
          {targetCostPerConversion > 0 && costPerConversion > 0 && (
            <p className={`text-xs font-medium ${cpcClasses.text}`}>
              {formatCurrency(Math.abs(cpcDiff), currency)} {cpcGood ? t('belowTarget') : t('aboveTarget')}
            </p>
          )}
          {(targetCostPerConversion === 0 || costPerConversion === 0) && (
            <p className="text-xs text-brand-muted">{t('target')}: {formatCurrency(targetCostPerConversion, currency)}</p>
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
                  className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-brand-light ${cpcClasses.bar}`}
                  style={{ right: `${actualPos}%` }}
                />
              )}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-brand-muted">
              <span>0</span>
              <span className="font-semibold text-brand-dark">{t('target')} {formatCurrency(targetCostPerConversion, currency)}</span>
              <span>{formatCurrency(cpcMaxScale, currency)}</span>
            </div>
          </div>
          {hasBreakdown && (
            <div className="mt-2 border-t border-brand-border/60 pt-2 text-[11px] text-brand-muted">
              {(metaSpend ?? 0) > 0 && <span>Meta: {(metaConversions ?? 0) > 0 ? formatCurrency((metaSpend ?? 0) / (metaConversions ?? 1), currency) : "—"}</span>}
              {(metaSpend ?? 0) > 0 && (gadsSpend ?? 0) > 0 && <span> · </span>}
              {(gadsSpend ?? 0) > 0 && <span>Google: {(gadsConversions ?? 0) > 0 ? formatCurrency((gadsSpend ?? 0) / (gadsConversions ?? 1), currency) : "—"}</span>}
              {((metaSpend ?? 0) > 0 || (gadsSpend ?? 0) > 0) && (ttSpend ?? 0) > 0 && <span> · </span>}
              {(ttSpend ?? 0) > 0 && <span>TikTok: {(ttConversions ?? 0) > 0 ? formatCurrency((ttSpend ?? 0) / (ttConversions ?? 1), currency) : "—"}</span>}
            </div>
          )}
        </div>

        {/* ============ קוביית המרות ============ */}
        <div className={`rounded-lg border ${convClasses.border} ${convClasses.bg} p-4`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-brand-muted">{t('conversionsThisMonth')}</p>
            {clientId && (metaCampaignResults?.length ?? 0) > 0 && (
              <button
                onClick={() => setManagerOpen(true)}
                title="נהל אילו קמפיינים נספרים בהמרות"
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-brand-muted hover:bg-brand-bg hover:text-brand-dark"
              >
                <SlidersHorizontal className="h-3 w-3" /> נהל
              </button>
            )}
          </div>
          <p className="mt-1 text-2xl font-semibold text-brand-dark">
            {conversions.toLocaleString()}
            <span className="text-sm font-normal text-brand-muted"> / {targetConversions.toLocaleString()}</span>
          </p>
          <p className={`text-xs font-medium ${convClasses.text}`}>
            {hitConvGoal ? `🎯 ${Math.round(convPct)}% — עקף את היעד!` : `${Math.round(convPct)}% ${t('ofTarget')}`}
          </p>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-brand-border/60">
            <div
              className={`h-full rounded-full ${convClasses.bar} transition-all`}
              style={{ width: `${Math.min(convPct, 100)}%` }}
            />
          </div>

          <div className="mt-3 border-t border-brand-border/60 pt-2">
            {hitConvGoal ? (
              <p className="text-sm font-semibold text-brand-success">✓ היעד החודשי הושג — כל המרה מכאן היא בונוס</p>
            ) : (
              <>
                <p className="text-xs text-brand-muted">{t('convNeededPerDay')}</p>
                <p className="text-sm font-semibold text-brand-dark">
                  {dailyConversionsNeeded.toLocaleString()} {t('conversions')}
                  <span className="text-xs font-normal text-brand-muted"> · {daysRemaining} {t('daysRemaining')}</span>
                </p>
              </>
            )}
          </div>
          {hasBreakdown && (
            <div className="mt-2 flex flex-wrap items-center gap-x-1 border-t border-brand-border/60 pt-2 text-[11px] text-brand-muted">
              {(metaConversions ?? 0) > 0 && <ConvChip name="Meta" count={metaConversions ?? 0} items={conversionBreakdown?.meta} />}
              {(metaConversions ?? 0) > 0 && (gadsConversions ?? 0) > 0 && <span>·</span>}
              {(gadsConversions ?? 0) > 0 && <ConvChip name="Google" count={gadsConversions ?? 0} items={conversionBreakdown?.google} />}
              {((metaConversions ?? 0) > 0 || (gadsConversions ?? 0) > 0) && (ttConversions ?? 0) > 0 && <span>·</span>}
              {(ttConversions ?? 0) > 0 && <ConvChip name="TikTok" count={ttConversions ?? 0} items={conversionBreakdown?.tiktok} />}
            </div>
          )}
        </div>
      </div>

      {managerOpen && clientId && metaCampaignResults && (
        <ConversionManager
          clientId={clientId}
          campaigns={metaCampaignResults}
          onClose={() => setManagerOpen(false)}
          onSaved={() => onExclusionsChanged?.()}
        />
      )}
    </div>
  );
}
