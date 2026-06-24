// קיבוץ קמפיינים למוצרים לפי שם הקמפיין — לדוחות פר-מוצר.
// קמפיין ששמו (מנורמל) מכיל את שם המוצר משויך אליו; השאר → "כללי".

import type { CampaignRow } from "./weekly-data";

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'`׳״’]/g, "")
    .replace(/[.,\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ProductGroup {
  product: string;
  campaigns: CampaignRow[];
  totals: { spend: number; impressions: number; clicks: number; conversions: number; conversionsValue: number };
}

function sumRows(rows: CampaignRow[]) {
  return {
    spend: rows.reduce((s, r) => s + r.spend, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    conversions: rows.reduce((s, r) => s + r.conversions, 0),
    conversionsValue: rows.reduce((s, r) => s + r.conversionsValue, 0),
  };
}

export function groupCampaignsByProduct(
  perCampaign: CampaignRow[],
  products: Array<{ name: string }>,
): ProductGroup[] {
  const productNames = products.map((p) => p.name).filter((n) => n && n.trim());
  const groups = new Map<string, CampaignRow[]>();
  for (const name of productNames) groups.set(name, []);
  const other: CampaignRow[] = [];

  for (const c of perCampaign) {
    const cn = normalizeName(c.campaignName);
    const match = productNames.find((p) => cn.includes(normalizeName(p)));
    if (match) groups.get(match)!.push(c);
    else other.push(c);
  }

  const result: ProductGroup[] = [];
  for (const [product, campaigns] of groups) {
    result.push({ product, campaigns, totals: sumRows(campaigns) });
  }
  if (other.length) result.push({ product: "כללי / לא משויך למוצר", campaigns: other, totals: sumRows(other) });
  return result;
}
