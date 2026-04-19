"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/data/context";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncomeRow {
  id: string;
  clientId: string;
  clientName: string;
  terms: string;
  invoiceIssued: boolean;
  invoiceDate: string;
  amount: number;
  vat: number;
  paid: boolean;
  receiptIssued: boolean;
  collectionDate: string;
  serviceMonth: number;
  paymentTerms: string;
  automation: boolean;
}

interface ExpenseRow {
  id: string;
  category: string;
  expenseType: string;
  paymentMethod: string;
  creditCardLast4: string;
  amountInclVat: number;
  amountBeforeVat: number;
  vat: number;
  chargeDate: string;
  clearingDate: string;
  filed: boolean;
  requiresReceipt: boolean;
  receiptProvided: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const inputClass =
  "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

const cardClass =
  "rounded-lg border border-brand-border bg-brand-light p-5 shadow-sm";

const HEBREW_MONTHS = [
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

const PAYMENT_TERMS_OPTIONS = [
  { value: "שוטף+0", label: "שוטף+0" },
  { value: "שוטף+30", label: "שוטף+30" },
  { value: "שוטף+45", label: "שוטף+45" },
  { value: "שוטף+60", label: "שוטף+60" },
  { value: "אחר", label: "אחר" },
];

const EXPENSE_CATEGORIES = [
  { value: "government", label: "ממשלה / מיסים" },
  { value: "tools", label: "כלים ותוכנות" },
  { value: "marketing", label: "שיווק ופרסום" },
  { value: "salaries", label: "שכר ומשכורות" },
  { value: "suppliers", label: "ספקים" },
  { value: "office", label: "משרד" },
  { value: "insurance", label: "ביטוח" },
  { value: "other", label: "אחר" },
];

const PAYMENT_METHODS = [
  { value: "standing_order", label: "הוראת קבע" },
  { value: "credit", label: "אשראי" },
  { value: "transfer", label: "העברה בנקאית" },
  { value: "cash", label: "מזומן" },
  { value: "paypal", label: "PayPal" },
  { value: "other", label: "אחר" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("he-IL", {
    maximumFractionDigits: 2,
  }).format(n);
}

function categoryLabel(val: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === val)?.label ?? val;
}

function paymentMethodLabel(val: string) {
  return PAYMENT_METHODS.find((m) => m.value === val)?.label ?? val;
}

// ---------------------------------------------------------------------------
// Editable Cell Components
// ---------------------------------------------------------------------------

function EditableText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <span
        className={`cursor-pointer rounded px-1 hover:bg-brand-bg ${className ?? ""}`}
        onClick={() => setEditing(true)}
      >
        {value || "—"}
      </span>
    );
  }

  return (
    <input
      autoFocus
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (draft !== value) onSave(draft);
        }
        if (e.key === "Escape") {
          setEditing(false);
          setDraft(value);
        }
      }}
    />
  );
}

function EditableNumber({
  value,
  onSave,
  prefix,
}: {
  value: number;
  onSave: (v: number) => void;
  prefix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 hover:bg-brand-bg"
        onClick={() => setEditing(true)}
      >
        {prefix}
        {fmtNum(value)}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      step="any"
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = parseFloat(draft) || 0;
        if (n !== value) onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          const n = parseFloat(draft) || 0;
          if (n !== value) onSave(n);
        }
        if (e.key === "Escape") {
          setEditing(false);
          setDraft(String(value));
        }
      }}
    />
  );
}

function EditableDate({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 hover:bg-brand-bg"
        onClick={() => setEditing(true)}
      >
        {value
          ? new Date(value).toLocaleDateString("he-IL")
          : "—"}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="date"
      className={inputClass}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
    />
  );
}

function EditableSelect({
  value,
  options,
  onSave,
  displayValue,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
  displayValue?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 hover:bg-brand-bg"
        onClick={() => setEditing(true)}
      >
        {(displayValue ?? (options.find((o) => o.value === value)?.label ?? value)) || "—"}
      </span>
    );
  }

  return (
    <select
      autoFocus
      className={inputClass}
      value={value}
      onChange={(e) => {
        setEditing(false);
        if (e.target.value !== value) onSave(e.target.value);
      }}
      onBlur={() => setEditing(false)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className={cardClass}>
      <p className="text-xs font-medium text-brand-muted">{label}</p>
      <p
        className="mt-1 text-xl font-semibold"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FinancePage() {
  const { t } = useLanguage();
  const { clients } = useApp();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<"income" | "expenses">("income");

  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Years range: current ± 2
  const yearOptions = useMemo(() => {
    const cur = now.getFullYear();
    return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client options for income table
  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: c.name })),
    [clients],
  );

  // Month options for service month dropdown
  const monthOptions = useMemo(
    () => HEBREW_MONTHS.map((label, i) => ({ value: String(i + 1), label })),
    [],
  );

  // -----------------------------------------------------------------------
  // Fetch data
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, expRes] = await Promise.all([
        fetch(`/api/finance/income?month=${month}&year=${year}`),
        fetch(`/api/finance/expenses?month=${month}&year=${year}`),
      ]);
      if (incRes.ok) {
        const data = await incRes.json();
        setIncomeRows(Array.isArray(data) ? data : data.data ?? []);
      }
      if (expRes.ok) {
        const data = await expRes.json();
        setExpenseRows(Array.isArray(data) ? data : data.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Income CRUD
  // -----------------------------------------------------------------------

  const addIncome = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      if (res.ok) {
        const row = await res.json();
        setIncomeRows((prev) => [...prev, row]);
      }
    } catch {
      // silent
    }
  }, [month, year]);

  const patchIncome = useCallback(
    async (id: string, field: string, value: unknown) => {
      setIncomeRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      );
      try {
        await fetch("/api/finance/income", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, [field]: value }),
        });
      } catch {
        // silent — optimistic update
      }
    },
    [],
  );

  const deleteIncome = useCallback(async (id: string) => {
    setIncomeRows((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch(`/api/finance/income?id=${id}`, { method: "DELETE" });
    } catch {
      // silent
    }
  }, []);

  // -----------------------------------------------------------------------
  // Expenses CRUD
  // -----------------------------------------------------------------------

  const addExpense = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      if (res.ok) {
        const row = await res.json();
        setExpenseRows((prev) => [...prev, row]);
      }
    } catch {
      // silent
    }
  }, [month, year]);

  const patchExpense = useCallback(
    async (id: string, field: string, value: unknown) => {
      setExpenseRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, [field]: value };
          // Auto-calc
          if (field === "amountInclVat") {
            const amt = value as number;
            updated.amountBeforeVat = Math.round((amt / 1.18) * 100) / 100;
            updated.vat =
              Math.round((amt - updated.amountBeforeVat) * 100) / 100;
          }
          if (field === "amountBeforeVat") {
            const before = value as number;
            updated.vat =
              Math.round((updated.amountInclVat - before) * 100) / 100;
          }
          return updated;
        }),
      );
      try {
        await fetch("/api/finance/expenses", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, [field]: value }),
        });
      } catch {
        // silent
      }
    },
    [],
  );

  const deleteExpense = useCallback(async (id: string) => {
    setExpenseRows((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetch(`/api/finance/expenses?id=${id}`, { method: "DELETE" });
    } catch {
      // silent
    }
  }, []);

  // -----------------------------------------------------------------------
  // Summary KPIs
  // -----------------------------------------------------------------------

  const totalIncome = useMemo(
    () => incomeRows.reduce((s, r) => s + (r.amount || 0), 0),
    [incomeRows],
  );
  const totalIncomeVat = useMemo(
    () => incomeRows.reduce((s, r) => s + (r.vat || 0), 0),
    [incomeRows],
  );
  const totalExpenses = useMemo(
    () => expenseRows.reduce((s, r) => s + (r.amountBeforeVat || 0), 0),
    [expenseRows],
  );
  const totalExpenseVat = useMemo(
    () => expenseRows.reduce((s, r) => s + (r.vat || 0), 0),
    [expenseRows],
  );
  const profit = totalIncome - totalExpenses;
  const vatToPay = totalIncomeVat - totalExpenseVat;

  // Income sub-KPIs
  const paidAmount = useMemo(
    () => incomeRows.filter((r) => r.paid).reduce((s, r) => s + (r.amount || 0), 0),
    [incomeRows],
  );
  const awaitingCollection = totalIncome - paidAmount;
  const invoiceCount = useMemo(
    () => incomeRows.filter((r) => r.invoiceIssued).length,
    [incomeRows],
  );

  // Expenses sub-KPIs
  const totalExpensesInclVat = useMemo(
    () => expenseRows.reduce((s, r) => s + (r.amountInclVat || 0), 0),
    [expenseRows],
  );
  const needsReceiptCount = useMemo(
    () => expenseRows.filter((r) => r.requiresReceipt && !r.receiptProvided).length,
    [expenseRows],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const thClass =
    "whitespace-nowrap px-3 py-2 text-xs font-medium text-brand-muted text-right";
  const tdClass = "whitespace-nowrap px-3 py-2 text-sm";

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Page title */}
      <h1 className="text-2xl font-semibold text-brand-dark">
        {t("finance")}
      </h1>

      {/* Month / Year selector */}
      <div className="flex items-center gap-3">
        <select
          className={inputClass + " w-36"}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {HEBREW_MONTHS.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>

        <select
          className={inputClass + " w-28"}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {loading && (
          <span className="text-sm text-brand-muted">{t("loading")}...</span>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label={t("totalIncome")} value={fmt(totalIncome)} />
        <KpiCard label={t("totalExpenses")} value={fmt(totalExpenses)} />
        <KpiCard
          label={t("profitLoss")}
          value={fmt(profit)}
          color={profit >= 0 ? "#22c55e" : "#ef4444"}
        />
        <KpiCard
          label={t("vatToPay")}
          value={fmt(vatToPay)}
          color={vatToPay >= 0 ? "#ef4444" : "#22c55e"}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-brand-border bg-brand-bg p-1">
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "income"
              ? "bg-brand-light text-brand-dark shadow-sm"
              : "text-brand-muted hover:text-brand-dark"
          }`}
          onClick={() => setTab("income")}
        >
          {t("income")}
        </button>
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "expenses"
              ? "bg-brand-light text-brand-dark shadow-sm"
              : "text-brand-muted hover:text-brand-dark"
          }`}
          onClick={() => setTab("expenses")}
        >
          {t("expenses")}
        </button>
      </div>

      {/* Income Tab */}
      {tab === "income" && (
        <div className="space-y-4">
          {/* Income KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <KpiCard label={t("totalIncome")} value={fmt(totalIncome)} />
            <KpiCard label={t("totalVat")} value={fmt(totalIncomeVat)} />
            <KpiCard label={t("paidAmount")} value={fmt(paidAmount)} />
            <KpiCard
              label={t("awaitingCollection")}
              value={fmt(awaitingCollection)}
              color={awaitingCollection > 0 ? "#f59e0b" : undefined}
            />
            <KpiCard
              label={t("invoiceCount")}
              value={String(invoiceCount)}
            />
          </div>

          {/* Income Table */}
          <div className={cardClass}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px]">
                <thead>
                  <tr className="border-b border-brand-border">
                    <th className={thClass}>{t("client")}</th>
                    <th className={thClass}>{t("terms")}</th>
                    <th className={thClass}>{t("invoiceIssued")}</th>
                    <th className={thClass}>{t("invoiceDate")}</th>
                    <th className={thClass}>{t("amount")} (₪)</th>
                    <th className={thClass}>{t("vat")} (₪)</th>
                    <th className={thClass}>{t("paid")}</th>
                    <th className={thClass}>{t("receiptIssued")}</th>
                    <th className={thClass}>{t("collectionDate")}</th>
                    <th className={thClass}>{t("serviceMonth")}</th>
                    <th className={thClass}>{t("paymentTerms")}</th>
                    <th className={thClass}>{t("automation")}</th>
                    <th className={thClass}></th>
                  </tr>
                </thead>
                <tbody>
                  {incomeRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-brand-border last:border-0 hover:bg-brand-bg/50"
                    >
                      {/* Client */}
                      <td className={tdClass}>
                        {row.clientId ? (
                          <EditableSelect
                            value={row.clientId}
                            options={clientOptions}
                            onSave={(v) => {
                              const client = clients.find((c) => c.id === v);
                              patchIncome(row.id, "clientId", v);
                              if (client)
                                patchIncome(row.id, "clientName", client.name);
                            }}
                            displayValue={row.clientName || "—"}
                          />
                        ) : (
                          <EditableText
                            value={row.clientName ?? ""}
                            onSave={(v) => patchIncome(row.id, "clientName", v)}
                          />
                        )}
                      </td>

                      {/* Terms */}
                      <td className={tdClass}>
                        <EditableText
                          value={row.terms ?? ""}
                          onSave={(v) => patchIncome(row.id, "terms", v)}
                        />
                      </td>

                      {/* Invoice issued */}
                      <td className={tdClass + " text-center"}>
                        <input
                          type="checkbox"
                          checked={row.invoiceIssued}
                          onChange={() =>
                            patchIncome(
                              row.id,
                              "invoiceIssued",
                              !row.invoiceIssued,
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-brand-gold"
                        />
                      </td>

                      {/* Invoice date */}
                      <td className={tdClass}>
                        <EditableDate
                          value={row.invoiceDate ?? ""}
                          onSave={(v) => patchIncome(row.id, "invoiceDate", v)}
                        />
                      </td>

                      {/* Amount */}
                      <td className={tdClass}>
                        <EditableNumber
                          value={row.amount ?? 0}
                          onSave={(v) => {
                            patchIncome(row.id, "amount", v);
                            patchIncome(
                              row.id,
                              "vat",
                              Math.round(v * 0.18 * 100) / 100,
                            );
                          }}
                          prefix="₪"
                        />
                      </td>

                      {/* VAT */}
                      <td className={tdClass}>
                        <EditableNumber
                          value={row.vat ?? 0}
                          onSave={(v) => patchIncome(row.id, "vat", v)}
                          prefix="₪"
                        />
                      </td>

                      {/* Paid */}
                      <td className={tdClass + " text-center"}>
                        <input
                          type="checkbox"
                          checked={row.paid}
                          onChange={() =>
                            patchIncome(row.id, "paid", !row.paid)
                          }
                          className="h-4 w-4 cursor-pointer accent-brand-gold"
                        />
                      </td>

                      {/* Receipt issued */}
                      <td className={tdClass + " text-center"}>
                        <input
                          type="checkbox"
                          checked={row.receiptIssued}
                          onChange={() =>
                            patchIncome(
                              row.id,
                              "receiptIssued",
                              !row.receiptIssued,
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-brand-gold"
                        />
                      </td>

                      {/* Collection date */}
                      <td className={tdClass}>
                        <EditableDate
                          value={row.collectionDate ?? ""}
                          onSave={(v) =>
                            patchIncome(row.id, "collectionDate", v)
                          }
                        />
                      </td>

                      {/* Service month */}
                      <td className={tdClass}>
                        <EditableSelect
                          value={String(row.serviceMonth ?? "")}
                          options={monthOptions}
                          onSave={(v) =>
                            patchIncome(row.id, "serviceMonth", Number(v))
                          }
                          displayValue={
                            row.serviceMonth
                              ? HEBREW_MONTHS[row.serviceMonth - 1]
                              : "—"
                          }
                        />
                      </td>

                      {/* Payment terms */}
                      <td className={tdClass}>
                        <EditableSelect
                          value={row.paymentTerms ?? ""}
                          options={PAYMENT_TERMS_OPTIONS}
                          onSave={(v) =>
                            patchIncome(row.id, "paymentTerms", v)
                          }
                        />
                      </td>

                      {/* Automation */}
                      <td className={tdClass + " text-center"}>
                        <input
                          type="checkbox"
                          checked={row.automation}
                          onChange={() =>
                            patchIncome(
                              row.id,
                              "automation",
                              !row.automation,
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-brand-gold"
                        />
                      </td>

                      {/* Delete */}
                      <td className={tdClass + " text-center"}>
                        <button
                          onClick={() => deleteIncome(row.id)}
                          className="rounded p-1 text-brand-muted transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {incomeRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={13}
                        className="py-8 text-center text-sm text-brand-muted"
                      >
                        {t("noData")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={addIncome}
              className="mt-4 flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors hover:bg-brand-gold/80"
            >
              <Plus size={16} />
              {t("addIncome")}
            </button>
          </div>
        </div>
      )}

      {/* Expenses Tab */}
      {tab === "expenses" && (
        <div className="space-y-4">
          {/* Expense KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label={t("totalExpenses")}
              value={fmt(totalExpenses)}
            />
            <KpiCard label={t("totalVat")} value={fmt(totalExpenseVat)} />
            <KpiCard
              label={t("totalWithVat")}
              value={fmt(totalExpensesInclVat)}
            />
            <KpiCard
              label={t("needsReceipt")}
              value={String(needsReceiptCount)}
              color={needsReceiptCount > 0 ? "#f59e0b" : undefined}
            />
          </div>

          {/* Expenses Table */}
          <div className={cardClass}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px]">
                <thead>
                  <tr className="border-b border-brand-border">
                    <th className={thClass}>{t("category")}</th>
                    <th className={thClass}>{t("expenseType")}</th>
                    <th className={thClass}>{t("paymentMethod")}</th>
                    <th className={thClass}>{t("creditCardLast4")}</th>
                    <th className={thClass}>{t("amountInclVat")} (₪)</th>
                    <th className={thClass}>{t("amountBeforeVat")} (₪)</th>
                    <th className={thClass}>{t("vat")} (₪)</th>
                    <th className={thClass}>{t("chargeDate")}</th>
                    <th className={thClass}>{t("clearingDate")}</th>
                    <th className={thClass}>{t("filed")}</th>
                    <th className={thClass}>{t("requiresReceipt")}</th>
                    <th className={thClass}>{t("receiptProvided")}</th>
                    <th className={thClass}></th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-brand-border last:border-0 hover:bg-brand-bg/50"
                    >
                      {/* Category */}
                      <td className={tdClass}>
                        <EditableSelect
                          value={row.category ?? ""}
                          options={EXPENSE_CATEGORIES}
                          onSave={(v) => patchExpense(row.id, "category", v)}
                          displayValue={categoryLabel(row.category)}
                        />
                      </td>

                      {/* Expense type */}
                      <td className={tdClass}>
                        <EditableText
                          value={row.expenseType ?? ""}
                          onSave={(v) =>
                            patchExpense(row.id, "expenseType", v)
                          }
                        />
                      </td>

                      {/* Payment method */}
                      <td className={tdClass}>
                        <EditableSelect
                          value={row.paymentMethod ?? ""}
                          options={PAYMENT_METHODS}
                          onSave={(v) =>
                            patchExpense(row.id, "paymentMethod", v)
                          }
                          displayValue={paymentMethodLabel(row.paymentMethod)}
                        />
                      </td>

                      {/* Credit card last 4 */}
                      <td className={tdClass}>
                        <EditableText
                          value={row.creditCardLast4 ?? ""}
                          onSave={(v) =>
                            patchExpense(
                              row.id,
                              "creditCardLast4",
                              v.slice(0, 4),
                            )
                          }
                        />
                      </td>

                      {/* Amount incl. VAT */}
                      <td className={tdClass}>
                        <EditableNumber
                          value={row.amountInclVat ?? 0}
                          onSave={(v) =>
                            patchExpense(row.id, "amountInclVat", v)
                          }
                          prefix="₪"
                        />
                      </td>

                      {/* Amount before VAT */}
                      <td className={tdClass}>
                        <EditableNumber
                          value={row.amountBeforeVat ?? 0}
                          onSave={(v) =>
                            patchExpense(row.id, "amountBeforeVat", v)
                          }
                          prefix="₪"
                        />
                      </td>

                      {/* VAT */}
                      <td className={tdClass}>
                        <span className="px-1 text-brand-muted">
                          ₪{fmtNum(row.vat ?? 0)}
                        </span>
                      </td>

                      {/* Charge date */}
                      <td className={tdClass}>
                        <EditableDate
                          value={row.chargeDate ?? ""}
                          onSave={(v) =>
                            patchExpense(row.id, "chargeDate", v)
                          }
                        />
                      </td>

                      {/* Clearing date */}
                      <td className={tdClass}>
                        <EditableDate
                          value={row.clearingDate ?? ""}
                          onSave={(v) =>
                            patchExpense(row.id, "clearingDate", v)
                          }
                        />
                      </td>

                      {/* Filed */}
                      <td className={tdClass + " text-center"}>
                        <input
                          type="checkbox"
                          checked={row.filed}
                          onChange={() =>
                            patchExpense(row.id, "filed", !row.filed)
                          }
                          className="h-4 w-4 cursor-pointer accent-brand-gold"
                        />
                      </td>

                      {/* Requires receipt */}
                      <td className={tdClass + " text-center"}>
                        <input
                          type="checkbox"
                          checked={row.requiresReceipt}
                          onChange={() =>
                            patchExpense(
                              row.id,
                              "requiresReceipt",
                              !row.requiresReceipt,
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-brand-gold"
                        />
                      </td>

                      {/* Receipt provided */}
                      <td className={tdClass + " text-center"}>
                        <input
                          type="checkbox"
                          checked={row.receiptProvided}
                          onChange={() =>
                            patchExpense(
                              row.id,
                              "receiptProvided",
                              !row.receiptProvided,
                            )
                          }
                          className="h-4 w-4 cursor-pointer accent-brand-gold"
                        />
                      </td>

                      {/* Delete */}
                      <td className={tdClass + " text-center"}>
                        <button
                          onClick={() => deleteExpense(row.id)}
                          className="rounded p-1 text-brand-muted transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {expenseRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={13}
                        className="py-8 text-center text-sm text-brand-muted"
                      >
                        {t("noData")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={addExpense}
              className="mt-4 flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors hover:bg-brand-gold/80"
            >
              <Plus size={16} />
              {t("addExpense")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
