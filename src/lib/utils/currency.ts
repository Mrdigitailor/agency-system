export const CURRENCIES = [
  { value: "ILS", label: "שקל (₪)", symbol: "₪" },
  { value: "USD", label: "דולר ($)", symbol: "$" },
] as const;

export type CurrencyCode = "ILS" | "USD";

export function getCurrencySymbol(currency?: string): string {
  if (currency === "USD") return "$";
  return "₪";
}

export function formatCurrency(amount: number, currency?: string): string {
  const symbol = getCurrencySymbol(currency);
  const rounded = Math.round(amount);
  return `${symbol} ${rounded.toLocaleString("he-IL")}`;
}
