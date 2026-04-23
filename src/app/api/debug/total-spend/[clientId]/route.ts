import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { metaApiGet } from "@/lib/api/meta/client";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const log: string[] = [];
  const out = (msg: string) => { console.log(`[DEBUG Spend] ${msg}`); log.push(msg); };

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  out(`========== Total Spend Debug for ${clientId} ==========`);
  out(`Period: ${monthStart} → ${today}`);

  // === 1. DB data ===
  const [metaRows, gadsRows, ttRows] = await Promise.all([
    prisma.metaInsightDaily.findMany({
      where: { clientId, date: { gte: monthStart, lte: today } },
      select: { date: true, spend: true },
    }),
    prisma.googleAdsInsightDaily.findMany({
      where: { clientId, date: { gte: monthStart, lte: today } },
      select: { date: true, spend: true },
    }),
    prisma.tikTokInsightDaily.findMany({
      where: { clientId, date: { gte: monthStart, lte: today } },
      select: { date: true, spend: true },
    }),
  ]);

  const metaDbSpend = metaRows.reduce((s, r) => s + r.spend, 0);
  const gadsDbSpend = gadsRows.reduce((s, r) => s + r.spend, 0);
  const ttDbSpend = ttRows.reduce((s, r) => s + r.spend, 0);
  const totalDbSpend = metaDbSpend + gadsDbSpend + ttDbSpend;

  // Meta dates
  const metaDates = new Set(metaRows.map((r) => r.date));
  const metaLastDate = metaRows.length > 0 ? [...metaDates].sort().pop() : null;

  // Google dates
  const gadsDates = new Set(gadsRows.map((r) => r.date));
  const gadsLastDate = gadsRows.length > 0 ? [...gadsDates].sort().pop() : null;

  out(`\n📊 DB Breakdown:`);
  out(`   Meta:    ₪${metaDbSpend.toFixed(2)} (${metaDates.size} days, last: ${metaLastDate ?? "none"})`);
  out(`   Google:  ₪${gadsDbSpend.toFixed(2)} (${gadsDates.size} days, last: ${gadsLastDate ?? "none"})`);
  out(`   TikTok:  ₪${ttDbSpend.toFixed(2)} (${new Set(ttRows.map(r => r.date)).size} days)`);
  out(`   TOTAL DB: ₪${totalDbSpend.toFixed(2)}`);

  // Missing days check
  const allDays: string[] = [];
  const d = new Date(monthStart);
  const end = new Date(today);
  while (d <= end) {
    allDays.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }

  const metaMissing = allDays.filter((d) => !metaDates.has(d));
  if (metaMissing.length > 0 && metaDates.size > 0) {
    out(`\n⚠️ Meta missing days: ${metaMissing.join(", ")}`);
  }

  // === 2. Live from API ===
  let metaApiSpend = 0;
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "ad_account" } } },
  });

  if (connection?.assets[0]) {
    const adAccount = connection.assets[0];
    try {
      const apiData = await metaApiGet<{ data: Array<{ spend: string }> }>(
        `/${adAccount.externalId}/insights`,
        {
          accessToken: connection.accessToken,
          params: {
            fields: "spend",
            time_range: JSON.stringify({ since: monthStart, until: today }),
            level: "account",
          },
        }
      );
      metaApiSpend = parseFloat(apiData.data?.[0]?.spend ?? "0");
      out(`\n📡 Meta API spend: ₪${metaApiSpend.toFixed(2)}`);
      out(`   Meta DB vs API diff: ₪${(metaApiSpend - metaDbSpend).toFixed(2)}`);
    } catch (err) {
      out(`\n❌ Meta API error: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    out(`\nℹ️ No Meta connection/ad account for this client`);
  }

  // === 3. Summary ===
  out(`\n📊 Summary:`);
  out(`   DB Total:  ₪${totalDbSpend.toFixed(2)}`);
  out(`   Meta API:  ₪${metaApiSpend.toFixed(2)} (DB has ₪${metaDbSpend.toFixed(2)})`);
  out(`   Google DB: ₪${gadsDbSpend.toFixed(2)}`);
  out(`   TikTok DB: ₪${ttDbSpend.toFixed(2)}`);

  const bestEstimate = metaApiSpend + gadsDbSpend + ttDbSpend;
  out(`   Best estimate (API Meta + DB others): ₪${bestEstimate.toFixed(2)}`);

  return NextResponse.json({
    log,
    period: { since: monthStart, until: today },
    db: { meta: Math.round(metaDbSpend * 100) / 100, google: Math.round(gadsDbSpend * 100) / 100, tiktok: Math.round(ttDbSpend * 100) / 100, total: Math.round(totalDbSpend * 100) / 100 },
    api: { meta: Math.round(metaApiSpend * 100) / 100 },
    metaMissingDays: metaMissing,
    metaLastDate,
  });
}
