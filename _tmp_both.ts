import "dotenv/config";
import { prisma } from "./src/lib/db/prisma";
import { syncClientMetaSubLevels } from "./src/lib/api/meta/sync";
import { getWeeklyClientData, getWeeklyBreakdowns } from "./src/lib/reports/weekly-data";
async function main() {
  const id = "cmnkol7dv00029kfxk4xwxxow";
  // ניקוי רמות ישנות (יומיות) כדי לבדוק את האגרגציה מאפס
  await prisma.metaInsightDaily.deleteMany({ where: { clientId: id, level: { in: ["adset","ad"] } } });
  const t0 = Date.now();
  await syncClientMetaSubLevels(id, "2026-07-05", "2026-07-11");
  console.log(`⏱️ שאיבת רמות עמוקות: ${((Date.now()-t0)/1000).toFixed(1)}ש' (היה 48ש')`);
  const lv = await prisma.metaInsightDaily.groupBy({ by: ["level"], where: { clientId: id, level: {in:["adset","ad"]} }, _count: true });
  console.log("שורות:", lv.map(l=>`${l.level}=${l._count}`).join(" | "), "(היה 72+223)");
  const bd = await getWeeklyBreakdowns(id, "2026-07-05", "2026-07-11");
  console.log(`פילוח: קהלים=${bd.audiences.length} מודעות=${bd.ads.length}`);
  const data = await getWeeklyClientData(id, "2026-07-05", "2026-07-11");
  console.log("\nסיווג instagram traffic:", data.perCampaign.find(c=>c.campaignName.includes("instagram traffic"))?.resultType, "(צריך: engagement)");
  await prisma.$disconnect();
}
main().catch(e=>{console.log("ERR",e.message);process.exit(1)});
