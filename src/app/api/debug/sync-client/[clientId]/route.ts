import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { syncClientMeta } from "@/lib/api/meta/sync";

/**
 * Debug endpoint — מריץ syncClientMeta עבור לקוח ומחזיר לוגים מפורטים
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { clientId } = await params;
  const log: string[] = [];
  const out = (msg: string) => { console.log(`[DEBUG Sync] ${msg}`); log.push(msg); };

  out(`========== Debug Sync for client ${clientId} ==========`);

  // 1. פרטי לקוח
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, metaConversionEvent: true, monthlyBudget: true },
  });
  if (!client) {
    out("❌ לקוח לא נמצא");
    return NextResponse.json({ log, error: "client_not_found" });
  }
  out(`✅ לקוח: ${client.name} (id=${client.id})`);
  out(`   metaConversionEvent: "${client.metaConversionEvent}"`);

  // 2. חיבור + נכסים
  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: true },
  });
  if (!connection) {
    out("❌ אין חיבור Meta פעיל");
    return NextResponse.json({ log, error: "no_connection" });
  }
  out(`✅ חיבור: ${connection.accountName} | token: ${connection.accessToken.slice(0, 15)}... | expires: ${connection.tokenExpiry?.toISOString() ?? "null"}`);
  out(`   lastSyncAt: ${connection.lastSyncAt?.toISOString() ?? "never"}`);
  out(`   Total assets: ${connection.assets.length}`);

  const selected = connection.assets.filter((a) => a.isSelected);
  out(`   Selected assets: ${selected.length}`);
  for (const a of selected) {
    out(`     ${a.assetType} | ${a.externalId} | ${a.name}`);
  }

  const adAccounts = selected.filter((a) => a.assetType === "ad_account");
  if (adAccounts.length === 0) {
    out("⚠️  אין חשבון מודעות נבחר (isSelected=true, assetType=ad_account)");
    out("   → לא ניתן לשאוב insights. וודא שנבחר חשבון מודעות בניהול נכסים.");
  } else {
    for (const acc of adAccounts) {
      const hasActPrefix = acc.externalId.startsWith("act_");
      out(`   Ad account: ${acc.externalId} (act_ prefix: ${hasActPrefix ? "✅" : "❌"})`);
      if (!hasActPrefix) {
        out(`   ⚠️  חשבון מודעות חייב להתחיל ב-act_`);
      }
    }
  }

  const pixels = selected.filter((a) => a.assetType === "pixel");
  out(`   Pixels selected: ${pixels.length}`);

  // 3. נתונים קיימים ב-DB
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const existingInsights = await prisma.metaInsightDaily.count({
    where: { clientId, date: { gte: monthStart, lte: today } },
  });
  out(`   Existing insights (this month): ${existingInsights}`);

  // 4. הרצת סנכרון
  out(`\n📡 מריץ syncClientMeta(${clientId}, 30, true)...`);
  try {
    const stats = await syncClientMeta(clientId, 30, true);
    out(`\n✅ סנכרון הסתיים:`);
    out(`   Ad insights fetched: ${stats.adInsightsFetched}`);
    out(`   Page posts fetched: ${stats.pagePostsFetched}`);
    out(`   IG media fetched: ${stats.igMediaFetched}`);
    if (stats.errors.length > 0) {
      out(`   ❌ Errors:`);
      stats.errors.forEach((e) => out(`     ${e}`));
    }

    // 5. בדיקה אחרי סנכרון
    const newInsights = await prisma.metaInsightDaily.count({
      where: { clientId, date: { gte: monthStart, lte: today } },
    });
    out(`   Insights after sync: ${newInsights} (was: ${existingInsights})`);

    const totalSpend = await prisma.metaInsightDaily.aggregate({
      where: { clientId, date: { gte: monthStart, lte: today } },
      _sum: { spend: true, conversions: true },
    });
    out(`   Month spend: ${totalSpend._sum.spend ?? 0}`);
    out(`   Month conversions: ${totalSpend._sum.conversions ?? 0}`);

    return NextResponse.json({ log, stats, insightsCount: newInsights });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out(`❌ syncClientMeta failed: ${msg}`);
    if (err instanceof Error && err.stack) out(`   Stack: ${err.stack.slice(0, 500)}`);
    return NextResponse.json({ log, error: msg });
  }
}
