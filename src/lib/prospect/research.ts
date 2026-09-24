// מחקר מילות מפתח למתעניין — הלב של דוח הפוטנציאל.
// עיקרון: לא מנחשים וריאציות. Claude מייצר זרעים חכמים לפי התחום,
// גוגל מרחיבה אותם למשפחת הביטויים המלאה עם נפחים ומחירים, ואנחנו מסננים.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { getValidGoogleToken } from "@/lib/api/google-ads/client";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AI_MODEL = process.env.REPORT_AI_MODEL ?? "claude-sonnet-4-6";
const GOOGLE_ADS_API = `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION ?? "v24"}`;

// רעש אוניברסלי — מה שאף קמפיין לא היה מוכן לשלם עליו
const NOISE_TERMS = ["דרושים", "משרה", "שכר", "קורס", "לימוד", "ללמוד", "מה זה", "חינם", "בעצמי", "וויקס", "וורדפרס"];

export interface KeywordRow {
  text: string;
  vol: number;   // חיפושים חודשיים ממוצעים
  low: number;   // הצעת מחיר נמוכה לקליק (₪)
  high: number;  // הצעת מחיר גבוהה לקליק (₪)
  mid: number;   // אמצע הטווח — הבסיס למספר הכותרת
}

export interface ResearchResult {
  seeds: string[];
  kept: KeywordRow[];
  droppedNoise: string[];     // סוננו כרעש אוניברסלי
  droppedIrrelevant: string[]; // סוננו כלא-רלוונטיים לשירות (ע"י המוח)
  totalVol: number;
  cpc: { low: number; mid: number; high: number }; // ממוצעים משוקללי-נפח
}

/** Claude מייצר זרעים בשלושה סוגים: שם השירות, שם+כוונת קנייה, ניסוח הבעיה */
async function generateSeeds(serviceField: string, serviceArea: string): Promise<string[]> {
  const res = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 500,
    system: "אתה מומחה מחקר מילות מפתח בגוגל בעברית. החזר אך ורק JSON תקין, בלי טקסט נוסף.",
    messages: [{
      role: "user",
      content: `עסק בתחום: "${serviceField}"${serviceArea ? ` (אזור שירות: ${serviceArea})` : ""}.
צור 8 עד 10 מילות זרע בעברית לכלי מילות המפתח של גוגל, בשלושה סוגים:
1. שם השירות וניסוחים נפוצים שלו (4-5). חובה לכלול את הניסוחים הכי רחבים וגנריים שהקהל באמת מקליד, גם אם הם קצרים (למשל בתחום פרסום: "קידום ממומן", "פרסום בגוגל"). הביטויים הרחבים מחזיקים את רוב נפח החיפוש.
2. שם השירות עם כוונת קנייה: מומלץ / מחיר / עלות (2-3)
3. ניסוח הבעיה, מה מקליד מי שעוד לא יודע איך קוראים לפתרון (2)
החזר JSON בלבד: {"seeds": ["...", "..."]}`,
    }],
  });
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "{}";
  try {
    const parsed = JSON.parse(text.replace(/^```json?\s*|\s*```$/g, ""));
    const seeds = (parsed.seeds as string[]).filter((s) => typeof s === "string" && s.trim()).slice(0, 10);
    if (seeds.length >= 3) return seeds;
  } catch { /* נופל להמשך */ }
  // fallback דטרמיניסטי — לא מפילים את הדוח בגלל ניסוח
  return [serviceField, `${serviceField} מחיר`, `${serviceField} מומלץ`];
}

/** קריאה לגוגל דרך חיבור פעיל — מנסה חיבורים לפי סנכרון אחרון עד שאחד מצליח */
async function fetchKeywordIdeas(seeds: string[]): Promise<Array<{ text: string; vol: number; low: number; high: number }>> {
  const conns = await prisma.platformConnection.findMany({
    where: { platform: "google_ads", isActive: true, refreshToken: { not: "" } },
    include: { assets: { where: { assetType: "google_ads_account", isSelected: true } } },
    orderBy: { lastSyncAt: "desc" },
  });

  let lastError = "";
  for (const conn of conns) {
    const asset = conn.assets.find((a) => /^\d{10}$/.test(a.externalId.replace(/-/g, "")) && a.externalId !== "1234567890");
    if (!asset) continue;
    try {
      const token = await getValidGoogleToken(conn);
      const mccId = (JSON.parse(asset.extraData || "{}").mccId ?? "") as string;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
        "Content-Type": "application/json",
      };
      if (mccId) headers["login-customer-id"] = mccId.replace(/-/g, "");

      const res = await fetch(`${GOOGLE_ADS_API}/customers/${asset.externalId.replace(/-/g, "")}:generateKeywordIdeas`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          language: "languageConstants/1027",              // עברית
          geoTargetConstants: ["geoTargetConstants/2376"], // ישראל
          keywordPlanNetwork: "GOOGLE_SEARCH",
          keywordSeed: { keywords: seeds },
          pageSize: 1000,
        }),
      });
      if (!res.ok) { lastError = `${res.status} via ${asset.name}`; continue; }
      const data = await res.json();
      return ((data.results ?? []) as Array<{ text: string; keywordIdeaMetrics?: Record<string, string> }>).map((r) => ({
        text: r.text,
        vol: Number(r.keywordIdeaMetrics?.avgMonthlySearches ?? 0),
        low: Number(r.keywordIdeaMetrics?.lowTopOfPageBidMicros ?? 0) / 1e6,
        high: Number(r.keywordIdeaMetrics?.highTopOfPageBidMicros ?? 0) / 1e6,
      }));
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown";
      continue;
    }
  }
  throw new Error(`Keyword research failed on all connections: ${lastError}`);
}

/** סינון הקשר ע"י המוח: מצליבים את הביטויים מול מה שהעסק באמת מציע. בספק — משאירים. */
async function filterByServiceContext(texts: string[], serviceField: string): Promise<Set<string>> {
  if (texts.length === 0) return new Set();
  try {
    const res = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 800,
      system: "אתה מסנן מילות מפתח. החזר אך ורק JSON תקין.",
      messages: [{
        role: "user",
        content: `עסק בתחום: "${serviceField}".
מתוך רשימת הביטויים הבאה, החזר אך ורק ביטויים שברור לחלוטין שהם עוסקים בשירות אחר שהעסק לא מציע, או בכוונה שאינה חיפוש ספק (למשל חיפוש עבודה או לימודים).
כלל ברזל: בכל ספק — לא לסנן. עדיף להשאיר ביטוי גבולי מאשר לזרוק ביטוי רלוונטי.
רשימה: ${JSON.stringify(texts)}
החזר JSON בלבד: {"drop": ["..."]}`,
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && "text" in block ? block.text : "{}";
    const parsed = JSON.parse(text.replace(/^```json?\s*|\s*```$/g, ""));
    return new Set((parsed.drop as string[]) ?? []);
  } catch {
    return new Set(); // הסינון הזה הוא שיפור, לא תנאי — כישלון בו לא מפיל דוח
  }
}

/** מחקר מלא: זרעים ← הרחבה ← סינון ← אגרגציה */
export async function runResearch(serviceField: string, serviceArea: string): Promise<ResearchResult> {
  const seeds = await generateSeeds(serviceField, serviceArea);
  const raw = await fetchKeywordIdeas(seeds);

  const droppedNoise: string[] = [];
  const candidates: KeywordRow[] = [];
  for (const r of raw) {
    if (NOISE_TERMS.some((n) => r.text.includes(n))) { droppedNoise.push(r.text); continue; }
    if (r.vol < 10 || !r.high) { droppedNoise.push(r.text); continue; }
    candidates.push({ ...r, mid: (r.low + r.high) / 2 });
  }

  const dropSet = await filterByServiceContext(candidates.map((c) => c.text), serviceField);
  const kept = candidates.filter((c) => !dropSet.has(c.text)).sort((a, b) => b.vol - a.vol);
  const droppedIrrelevant = candidates.filter((c) => dropSet.has(c.text)).map((c) => c.text);

  const totalVol = kept.reduce((s, k) => s + k.vol, 0);

  // הגנת חריגים: לביטויים מותגיים גוגל לפעמים מחזירה הצעות מחיר מופרכות (אלפי ₪ לקליק).
  // ביטוי כזה נשאר בספירת הביקוש (הביקוש אמיתי) אבל לא משתתף בחישוב מחיר הקליק.
  const mids = kept.map((k) => k.mid).sort((a, b) => a - b);
  const medianMid = mids.length ? mids[Math.floor(mids.length / 2)] : 0;
  const priced = medianMid > 0 ? kept.filter((k) => k.mid <= medianMid * 4) : kept;
  const pricedVol = priced.reduce((s, k) => s + k.vol, 0);
  const w = (f: (k: KeywordRow) => number) => (pricedVol > 0 ? priced.reduce((s, k) => s + f(k) * k.vol, 0) / pricedVol : 0);

  return {
    seeds, kept, droppedNoise, droppedIrrelevant, totalVol,
    cpc: { low: w((k) => k.low), mid: w((k) => k.mid), high: w((k) => k.high) },
  };
}
