// AI שיחתי לדשבורד — עונה לבעל העסק על שאלות לגבי המספרים שלו,
// מעוגן ב-snapshot של התקופה הנוכחית מול הקודמת.

import Anthropic from "@anthropic-ai/sdk";
import { computeSnapshot, type ClientCtx, type DateRange, type Snapshot, type PlatformSnapshot } from "./engine";
import { getCurrencySymbol } from "@/lib/utils/currency";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.DASHBOARD_AI_MODEL ?? "claude-sonnet-4-6";

function previousRange(r: DateRange): DateRange {
  const since = new Date(r.since);
  const until = new Date(r.until);
  const days = Math.round((until.getTime() - since.getTime()) / 86400000) + 1;
  const prevUntil = new Date(since.getTime() - 86400000);
  const prevSince = new Date(prevUntil.getTime() - (days - 1) * 86400000);
  return { since: prevSince.toISOString().slice(0, 10), until: prevUntil.toISOString().slice(0, 10) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function platformLine(label: string, p: PlatformSnapshot, cur: string): string | null {
  if (p.spend === 0 && p.conversions === 0) return null;
  const sym = getCurrencySymbol(cur);
  return `  - ${label}: הוצאה ${sym}${r2(p.spend)}, ${r2(p.conversions)} המרות, עלות/המרה ${p.cpa > 0 ? sym + r2(p.cpa) : "—"}, ROAS ${p.roas > 0 ? r2(p.roas) : "—"}, ${p.clicks} קליקים`;
}

function snapshotText(title: string, s: Snapshot, currency: string): string {
  const sym = getCurrencySymbol(currency);
  const lines = [`${title}:`];
  const a = s.ad.all;
  lines.push(`  סה״כ פרסום: הוצאה ${sym}${r2(a.spend)}, ${r2(a.conversions)} המרות, עלות/המרה ${a.cpa > 0 ? sym + r2(a.cpa) : "—"}, ROAS ${a.roas > 0 ? r2(a.roas) : "—"}`);
  for (const [label, p] of [["Meta", s.ad.meta], ["Google Ads", s.ad.google], ["TikTok", s.ad.tiktok]] as const) {
    const l = platformLine(label, p, currency);
    if (l) lines.push(l);
  }
  if (s.ga4) {
    const g = s.ga4.summary;
    if (s.ga4.mode === "ecom") {
      lines.push(`  אתר (איקומרס): הכנסות ${sym}${r2(g.revenue ?? 0)}, ${r2(g.transactions ?? 0)} עסקאות, ${r2(g.sessions ?? 0)} סשנים, יחס המרה ${r2((g.convRate ?? 0) * 100)}%`);
    } else {
      lines.push(`  אתר (לידים): ${r2(g.keyEvents ?? 0)} אירועי מפתח, ${r2(g.sessions ?? 0)} סשנים, יחס המרה ${r2((g.convRate ?? 0) * 100)}%`);
    }
    if (s.ga4.topChannels.length) lines.push(`  ערוצי אתר מובילים: ${s.ga4.topChannels.map((c) => `${c.name} (${r2(c.value)})`).join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * עונה על שאלת בעל העסק לגבי הנתונים — בעברית, פשוט, מעוגן במספרים.
 */
export async function answerDashboardQuestion(ctx: ClientCtx, range: DateRange, clientName: string, question: string): Promise<string> {
  const prev = previousRange(range);
  const [cur, before] = await Promise.all([computeSnapshot(ctx, range), computeSnapshot(ctx, prev)]);

  const context = [
    snapshotText(`התקופה הנוכחית (${range.since} עד ${range.until})`, cur, ctx.currency),
    snapshotText(`התקופה הקודמת באותו אורך (${prev.since} עד ${prev.until})`, before, ctx.currency),
  ].join("\n\n");

  const system =
    `אתה עוזר אנליטיקס ידידותי שמסביר לבעל העסק "${clientName}" את ביצועי השיווק שלו, בעברית פשוטה וברורה (לא ז'רגון).\n` +
    `ענה בקצרה ולעניין. כשמשווים תקופות — ציין אם יש שיפור/ירידה ובאיזה אחוז. ` +
    `אם נשאלת מה משמעות מדד (למשל "מה זה יחס המרה") — הסבר במשפט פשוט ואז תן את הערך בפועל. ` +
    `התבסס אך ורק על המספרים שסופקו, אל תמציא. אם אין נתון מסוים — אמור זאת. מטבע: ${getCurrencySymbol(ctx.currency)}.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system,
    messages: [{ role: "user", content: `הנתונים:\n${context}\n\nשאלת בעל העסק: ${question}` }],
  });

  const block = response.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text.trim() : "לא הצלחתי לנתח את הנתונים כרגע.";
}
