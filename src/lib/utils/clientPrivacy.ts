// פרטיות נתוני "התשלום אלינו" — שדות פיננסיים של ההתקשרות עם הסוכנות שאסור שיהיו
// שקופים למנהל קמפיינים. מטבע/תקציב המדיה (currency, monthlyBudget) נשארים גלויים לו.

export const AGENCY_PAYMENT_FIELDS = [
  "paymentCurrency",
  "dealType",
  "monthlyRetainer",
  "percentageRate",
  "percentageBase",
  "historicalRevenue",
  "projectAmount",
  "specialTerms",
  "contractStartDate",
  "contractEndDate",
] as const;

/** מסיר את שדות התשלום-אלינו מאובייקט לקוח אם התפקיד הוא מנהל קמפיינים. */
export function stripAgencyPayment<T extends Record<string, unknown>>(client: T, role: string | undefined): T {
  if (role !== "campaignManager") return client;
  const c = { ...client };
  for (const f of AGENCY_PAYMENT_FIELDS) delete c[f as keyof T];
  return c;
}
