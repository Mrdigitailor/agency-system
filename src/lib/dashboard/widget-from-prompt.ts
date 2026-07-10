// מחולל ווידג'טים מטקסט חופשי — מתרגם תיאור בעברית לקונפיגורציית ווידג'טים.
// מה שהמערכת יודעת לבנות → ווידג'טים; מה שלא → רשימת "unsupported" שמוצגת לסער.

import Anthropic from "@anthropic-ai/sdk";
import { METRICS, PLATFORM_LABELS, DIMENSION_LABELS, DISPLAY_LABELS } from "./metrics";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.REPORT_AI_MODEL ?? "claude-sonnet-4-6";

// מה שמותר להיווצר — חייב להתיישר עם המנוע (engine.ts) ועם metrics.ts
const PLATFORMS = ["meta", "google_ads", "tiktok", "all", "ga4"] as const;
const DISPLAY_TYPES = ["kpi", "line", "area", "bar", "pie", "table", "heading", "text", "platform_header"] as const;
const DIMENSIONS = ["none", "date", "week", "month", "platform", "campaign", "action", "searchTerm", "age", "gender", "device"] as const;

export interface GeneratedWidget {
  platform: string;
  displayType: string;
  dimension: string;
  metrics: string[];
  title: string;
  size: "full" | "half" | "third";
  campaignFilter?: string;
  excludeActions?: string[];
}
export interface WidgetFromPromptResult {
  widgets: GeneratedWidget[];
  /** בקשות שהמערכת לא יכולה למלא כרגע — יוצגו לסער כדי שיפנה לפיתוח */
  unsupported: string[];
}

function catalog(): string {
  const metricList = METRICS.map((m) => `${m.id} (${m.label}, פלטפורמות: ${m.platforms.join("/")})`).join("\n");
  const platformList = PLATFORMS.map((p) => `${p} = ${PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] ?? p}`).join(" | ");
  const displayList = DISPLAY_TYPES.map((d) => `${d} = ${DISPLAY_LABELS[d as keyof typeof DISPLAY_LABELS] ?? d}`).join(" | ");
  const dimList = DIMENSIONS.map((d) => `${d} = ${DIMENSION_LABELS[d as keyof typeof DIMENSION_LABELS] ?? d}`).join(" | ");
  return `**מדדים זמינים (metrics):**\n${metricList}\n\n**platform:** ${platformList}\n**displayType:** ${displayList}\n**dimension:** ${dimList}`;
}

const SYSTEM = `אתה בונה ווידג'טים לדשבורד שיווקי מתיאור בעברית של מנהל הסוכנות.
החזר אך ורק JSON תקין במבנה: { "widgets": [...], "unsupported": [...] }.

כל ווידג'ט: { platform, displayType, dimension, metrics: string[], title: string, size: "full"|"half"|"third", campaignFilter?: string, excludeActions?: string[] }.

חוקים:
- השתמש רק ב-platform/displayType/dimension/metrics מהקטלוג. אל תמציא מזהים.
- dimension "action" = פילוח לפי סוג המרה (טופס/שיחה/פגישה וכו'). "campaign" = טבלה/עוגה לפי קמפיין. "searchTerm" = טבלת מונחי חיפוש (Google Ads בלבד, displayType "table"). date/week/month = סדרת זמן (line/area/bar). platform = פילוח בין פלטפורמות. age/gender/device = רק ל-platform "google_ads".
- kpi = כרטיסי מספר (dimension תמיד "none"). table = טבלה (dimension "campaign" או "action").
- campaignFilter: אם המשתמש ביקש מוצר/קמפיין ספציפי ("מקמפיין single family") — שים את המילה המזהה כאן (התאמת "מכיל").
- excludeActions: אם ביקש להסתיר סוגי המרות מסוימים.
- title: כותרת קצרה וברורה בעברית.
- size: ברירת מחדל "full" ל-kpi/table/סדרת זמן; "half" לעוגות.

מונחי חיפוש (search terms / keywords מגוגל) **כן נתמכים**: displayType "table", dimension "searchTerm", platform "google_ads" (או "all"), metrics לפי הבקשה (impressions/clicks/ctr/cpc/conversions/cpa/spend). אם ביקשו מקמפיין מסוים — campaignFilter.

**מה שאי אפשר לבנות — הכנס ל-unsupported עם הסבר קצר בעברית מה חסר:**
- טבלת מודעות עם תמונות/thumbnails (לא זמין).
- מדדים שלא קיימים בקטלוג (למשל LTV, רווח נקי, נתוני CRM/סגירות, אחוז המרה למודעות).
- כל דבר שדורש מקור נתונים שאינו מטא/גוגל/טיקטוק/GA4.

**חוק קריטי:** לעולם אל תחזיר את שני המערכים ריקים. אם אינך יכול לבנות אף ווידג'ט מהבקשה — חובה לרשום ב-unsupported משפט אחד לפחות שמסביר בדיוק מה חסר כדי לבנות אותה. עדיף לרשום ב-unsupported מאשר להשאיר ריק.

אם הבקשה מורכבת מכמה חלקים — צור ווידג'ט לכל חלק שאפשר, ורשום ב-unsupported את החלקים שאי אפשר.

דוגמאות:
- "טבלה של קליקים והמרות לפי קמפיין" → widgets: [table/campaign, metrics ["clicks","conversions"]]. unsupported: [].
- "טבלה של מונחי החיפוש מקמפיין single family עם חשיפות, קליקים, המרות ועלות להמרה" → widgets: [{platform:"google_ads", displayType:"table", dimension:"searchTerm", metrics:["impressions","clicks","conversions","cpa"], campaignFilter:"single family", title:"מונחי חיפוש – Single Family", size:"full"}]. unsupported: [].
- "הרווח הנקי וה-LTV לכל לקוח" → widgets: []. unsupported: ["רווח נקי ו-LTV אינם זמינים — הם נתוני CRM/כספים שלא קיימים במערכת הפרסום."].`;

/** מריץ את המודל ומחזיר ווידג'טים תקינים + מה שלא נתמך */
export async function generateWidgetsFromPrompt(prompt: string): Promise<WidgetFromPromptResult> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `${SYSTEM}\n\n---\n\n${catalog()}`,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "";
  return sanitize(raw);
}

const metricIds = new Set(METRICS.map((m) => m.id));

/** מסנן את פלט המודל למבנה חוקי בלבד — הגנה מפני הזיות */
function sanitize(raw: string): WidgetFromPromptResult {
  let parsed: unknown;
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    parsed = JSON.parse(json);
  } catch {
    return { widgets: [], unsupported: ["לא הצלחתי להבין את הבקשה — נסה לנסח אותה מחדש בפירוט."] };
  }
  const obj = parsed as { widgets?: unknown; unsupported?: unknown };
  const unsupported = Array.isArray(obj.unsupported) ? obj.unsupported.filter((x): x is string => typeof x === "string") : [];
  const widgets: GeneratedWidget[] = [];

  for (const w of Array.isArray(obj.widgets) ? obj.widgets : []) {
    if (!w || typeof w !== "object") continue;
    const g = w as Record<string, unknown>;
    const platform = String(g.platform ?? "");
    const displayType = String(g.displayType ?? "");
    const dimension = String(g.dimension ?? "none");
    if (!PLATFORMS.includes(platform as never) || !DISPLAY_TYPES.includes(displayType as never) || !DIMENSIONS.includes(dimension as never)) {
      unsupported.push(`ווידג'ט "${g.title ?? ""}" השתמש בהגדרה לא חוקית — דילגתי עליו.`);
      continue;
    }
    const metrics = Array.isArray(g.metrics) ? g.metrics.filter((m): m is string => typeof m === "string" && metricIds.has(m)) : [];
    const size = g.size === "half" || g.size === "third" ? g.size : "full";
    widgets.push({
      platform,
      displayType,
      dimension,
      metrics,
      title: typeof g.title === "string" ? g.title : "",
      size,
      campaignFilter: typeof g.campaignFilter === "string" && g.campaignFilter.trim() ? g.campaignFilter.trim() : undefined,
      excludeActions: Array.isArray(g.excludeActions) ? g.excludeActions.filter((x): x is string => typeof x === "string") : undefined,
    });
  }
  // רשת ביטחון — לעולם לא להחזיר ריק בלי הסבר
  if (widgets.length === 0 && unsupported.length === 0) {
    unsupported.push("לא הצלחתי לבנות מהתיאור הזה — נסה לנסח אותו מחדש בפירוט, או שזו יכולת שעדיין לא קיימת וכדאי לפנות לפיתוח.");
  }
  return { widgets, unsupported };
}
