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

  out(`========== Debug Meta Spend for client ${clientId} ==========`);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 1. DB data
  const dbRows = await prisma.metaInsightDaily.findMany({
    where: { clientId, date: { gte: monthStart, lte: today } },
    select: { date: true, spend: true, level: true },
    orderBy: { date: "asc" },
  });

  // Aggregate by date (account level or sum of campaigns)
  const dateSpend = new Map<string, number>();
  for (const r of dbRows) {
    dateSpend.set(r.date, (dateSpend.get(r.date) ?? 0) + r.spend);
  }

  // Find unique dates at campaign level
  const campaignDates = new Set(dbRows.filter(r => r.level === "campaign").map(r => r.date));

  out(`\n📊 DB data (${monthStart} → ${today}):`);
  let dbTotal = 0;
  const sortedDates = Array.from(dateSpend.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [date, spend] of sortedDates) {
    dbTotal += spend;
    out(`   ${date}: ${spend.toFixed(2)} ₪`);
  }
  out(`\n   DB Total: ${dbTotal.toFixed(2)} ₪`);
  out(`   Days with data: ${dateSpend.size}`);
  out(`   Last date in DB: ${sortedDates.length > 0 ? sortedDates[sortedDates.length - 1][0] : "none"}`);
  out(`   Campaign-level dates: ${campaignDates.size}`);

  // Check if today and yesterday have data
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  out(`\n   Today (${today}) in DB: ${dateSpend.has(today) ? `yes (${dateSpend.get(today)?.toFixed(2)} ₪)` : "❌ NO"}`);
  out(`   Yesterday (${yesterdayStr}) in DB: ${dateSpend.has(yesterdayStr) ? `yes (${dateSpend.get(yesterdayStr)?.toFixed(2)} ₪)` : "❌ NO"}`);

  // 2. Live from Meta API
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { isSelected: true, assetType: "ad_account" } } },
  });

  if (!connection) {
    out("\n❌ No Meta connection");
    return NextResponse.json({ log, dbTotal, error: "no_connection" });
  }

  const adAccount = connection.assets[0];
  if (!adAccount) {
    out("\n❌ No ad account selected");
    return NextResponse.json({ log, dbTotal, error: "no_ad_account" });
  }

  out(`\n📡 Calling Meta API: /${adAccount.externalId}/insights`);
  out(`   time_range: ${monthStart} → ${today}`);

  try {
    const apiData = await metaApiGet<{ data: Array<{ spend: string; impressions: string; clicks: string; date_start: string; date_stop: string }> }>(
      `/${adAccount.externalId}/insights`,
      {
        accessToken: connection.accessToken,
        params: {
          fields: "spend,impressions,clicks",
          time_range: JSON.stringify({ since: monthStart, until: today }),
          level: "account",
        },
      }
    );

    const apiSpend = parseFloat(apiData.data?.[0]?.spend ?? "0");
    out(`\n✅ Meta API spend: ${apiSpend.toFixed(2)} ₪`);
    out(`   DB spend: ${dbTotal.toFixed(2)} ₪`);
    out(`   Difference: ${(apiSpend - dbTotal).toFixed(2)} ₪`);

    if (Math.abs(apiSpend - dbTotal) > 1) {
      out(`\n⚠️ Significant difference! Likely missing recent days.`);
    }

    // Also get last sync time
    out(`\n   Connection lastSyncAt: ${connection.lastSyncAt?.toISOString() ?? "never"}`);

    return NextResponse.json({
      log,
      dbTotal: Math.round(dbTotal * 100) / 100,
      apiTotal: Math.round(apiSpend * 100) / 100,
      difference: Math.round((apiSpend - dbTotal) * 100) / 100,
      daysInDb: dateSpend.size,
      lastDateInDb: sortedDates.length > 0 ? sortedDates[sortedDates.length - 1][0] : null,
      todayInDb: dateSpend.has(today),
      yesterdayInDb: dateSpend.has(yesterdayStr),
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`\n❌ API Error: ${msg}`);
    return NextResponse.json({ log, dbTotal, error: msg });
  }
}
