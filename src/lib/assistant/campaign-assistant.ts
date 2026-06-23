// מוח ה-assistant — מקבל הודעת טקסט, מריץ Claude עם tool-use, ומחזיר תשובה בעברית.
// פלטפורמה-אגנוסטי (משמש את בוט הטלגרם). יודע לפתוח משימות (עם שיוך אוטומטי)
// ולשלוף נתוני קמפיינים של לקוחות.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { notifyTaskAssigned } from "@/lib/notifications/task-notify";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.TELEGRAM_AI_MODEL ?? "claude-sonnet-4-6";

const tools: Anthropic.Tool[] = [
  {
    name: "create_task",
    description:
      "פותח משימה חדשה במערכת ומשייך אותה אוטומטית למנהל הקמפיינים של הלקוח. " +
      "השתמש כשהמשתמש מבקש לפתוח/להוסיף/ליצור משימה או מטלה.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "כותרת קצרה למשימה" },
        description: { type: "string", description: "פירוט המשימה (אופציונלי)" },
        client_name: { type: "string", description: "שם הלקוח שאליו המשימה קשורה, אם הוזכר" },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "עדיפות — low/medium/high/urgent. ברירת מחדל medium",
        },
        due_date: { type: "string", description: "תאריך יעד בפורמט YYYY-MM-DD, אם צוין" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_campaign_data",
    description:
      "שולף סיכום ביצועי קמפיינים של לקוח (הוצאה, חשיפות, קליקים, המרות) מ-Meta, Google Ads ו-TikTok " +
      "לתקופה נתונה. השתמש כשהמשתמש שואל על ביצועים/נתונים/הוצאה/המרות של לקוח.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "שם הלקוח" },
        days: { type: "number", description: "כמה ימים אחורה לסכם (ברירת מחדל 7)" },
      },
      required: ["client_name"],
    },
  },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ===== התאמת לקוח מטושטשת (fuzzy) =====

/** נרמול שם לצורך השוואה — אותיות קטנות, בלי גרשיים/פיסוק, רווחים מכווצים */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'`׳״’]/g, "")
    .replace(/[.,\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** מרחק עריכה (Levenshtein) בין שתי מחרוזות */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** דמיון 0..1 לפי מרחק עריכה */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** ניקוד התאמה 0..1 בין מה שהמשתמש כתב לשם לקוח */
function scoreClient(query: string, name: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  // הכלה (חיפוש חלקי — נפוץ מאוד כשכותבים חלק מהשם)
  if (n.includes(q) || q.includes(n)) return 0.92;
  // התאמה לפי מילים — כמה ממילות החיפוש מופיעות בשם הלקוח
  const qt = q.split(" ").filter(Boolean);
  const nt = n.split(" ").filter(Boolean);
  let hits = 0;
  for (const t of qt) {
    if (nt.some((x) => x.includes(t) || t.includes(x) || similarity(t, x) >= 0.8)) hits++;
  }
  const tokenScore = qt.length ? hits / qt.length : 0;
  // דמיון תווים כללי (תופס שגיאות כתיב)
  const charScore = similarity(q, n);
  return Math.max(tokenScore * 0.9, charScore);
}

interface ClientLite {
  id: string;
  name: string;
  campaignManagerId: string | null;
  campaignManager: string;
}

/**
 * מחפש לקוח לפי שם בהתאמה מטושטשת.
 * מחזיר את הטוב ביותר (אם הניקוד מעל סף ביטחון) ואת 3 הקרובים ביותר כהצעות.
 */
async function matchClient(query: string): Promise<{ best: ClientLite | null; suggestions: string[]; topScore: number }> {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, campaignManagerId: true, campaignManager: true },
  });
  const scored = clients
    .map((c) => ({ client: c, score: scoreClient(query, c.name) }))
    .sort((a, b) => b.score - a.score);

  const CONFIDENT = 0.6; // סף ביטחון לשיוך אוטומטי
  const best = scored[0];
  return {
    best: best && best.score >= CONFIDENT ? best.client : null,
    suggestions: scored.filter((s) => s.score > 0.25).slice(0, 3).map((s) => s.client.name),
    topScore: best?.score ?? 0,
  };
}

async function createTask(input: {
  title: string;
  description?: string;
  client_name?: string;
  priority?: string;
  due_date?: string;
}) {
  // התאמת לקוח — אם הוזכר שם אך לא נמצאה התאמה בטוחה, לא פותחים משימה
  // על לקוח שגוי; מחזירים הצעות כדי שהמשתמש יתקן.
  let client: ClientLite | null = null;
  if (input.client_name) {
    const m = await matchClient(input.client_name);
    if (!m.best) {
      return {
        ok: false,
        client_not_found: true,
        searched: input.client_name,
        suggestions: m.suggestions,
        message: m.suggestions.length
          ? `לא נמצא לקוח שמתאים ל-"${input.client_name}". הקרובים ביותר: ${m.suggestions.join(", ")}. המשימה לא נפתחה — בקש מהמשתמש לבחור שם מדויק.`
          : `לא נמצא לקוח שמתאים ל-"${input.client_name}", ואין שמות קרובים. המשימה לא נפתחה.`,
      };
    }
    client = m.best;
  }

  // שיוך: מנהל הקמפיינים של הלקוח → fallback: אדמין ראשון
  let assigneeId: string | null = null;
  let assigneeName = "";
  if (client?.campaignManagerId) {
    const u = await prisma.user.findUnique({ where: { id: client.campaignManagerId } });
    if (u) {
      assigneeId = u.id;
      assigneeName = u.name;
    }
  }
  if (!assigneeId) {
    const admin = await prisma.user.findFirst({ where: { role: "admin", isActive: true } });
    if (admin) {
      assigneeId = admin.id;
      assigneeName = admin.name;
    }
  }

  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? "",
      clientId: client?.id ?? null,
      assigneeId,
      assignee: assigneeName,
      priority: input.priority ?? "medium",
      dueDate: input.due_date ?? "",
      status: "pending",
      taskType: "other",
    },
  });

  // התראה במערכת + מייל לעובד — אותה לוגיקה כמו ב-/api/tasks.
  // creatorId ריק (אין משתמש מחובר בבוט) ולכן ההתראה תמיד נשלחת ולא נחסמת כ"שיוך עצמי".
  if (assigneeId) {
    try {
      await notifyTaskAssigned({
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        taskDueDate: task.dueDate,
        taskPriority: task.priority,
        clientId: task.clientId,
        assigneeId,
        creatorId: "",
        creatorName: "בוט טלגרם",
      });
    } catch (err) {
      console.error("[TelegramAssistant] notifyTaskAssigned failed:", err);
    }
  }

  return {
    ok: true,
    task_id: task.id,
    title: task.title,
    assigned_to: assigneeName || "לא שויך",
    client: client?.name ?? null,
    client_matched: input.client_name ? Boolean(client) : null,
    priority: task.priority,
    due_date: task.dueDate || null,
    employee_notified: Boolean(assigneeId),
  };
}

async function getCampaignData(input: { client_name: string; days?: number }) {
  const match = await matchClient(input.client_name);
  if (!match.best) {
    return {
      error: "client_not_found",
      searched: input.client_name,
      suggestions: match.suggestions,
      message: match.suggestions.length
        ? `לא נמצא לקוח שמתאים ל-"${input.client_name}". הקרובים ביותר: ${match.suggestions.join(", ")}.`
        : `לא נמצא לקוח שמתאים ל-"${input.client_name}".`,
    };
  }
  const client = match.best;

  const days = input.days && input.days > 0 ? Math.min(input.days, 90) : 7;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const fromStr = ymd(from);
  const toStr = ymd(to);
  const where = { clientId: client.id, date: { gte: fromStr, lte: toStr } };

  const [google, meta, tiktok] = await Promise.all([
    prisma.googleAdsInsightDaily.aggregate({
      where,
      _sum: { spend: true, impressions: true, clicks: true, conversions: true, conversionsValue: true },
    }),
    // Meta נשמר במספר רמות — מסכמים רק ברמת קמפיין כדי לא לספור פעמיים
    prisma.metaInsightDaily.aggregate({
      where: { ...where, level: "campaign" },
      _sum: { spend: true, impressions: true, clicks: true, conversions: true, purchaseValue: true, leads: true },
    }),
    prisma.tikTokInsightDaily.aggregate({
      where,
      _sum: { spend: true, impressions: true, clicks: true, conversions: true },
    }),
  ]);

  const r = (n: number | null | undefined) => Math.round((n ?? 0) * 100) / 100;
  const g = google._sum;
  const m = meta._sum;
  const t = tiktok._sum;

  const totalSpend = r((g.spend ?? 0) + (m.spend ?? 0) + (t.spend ?? 0));
  const totalConversions = r((g.conversions ?? 0) + (m.conversions ?? 0) + (t.conversions ?? 0));

  return {
    client: client.name,
    period: `${fromStr} עד ${toStr} (${days} ימים)`,
    google: { spend: r(g.spend), impressions: g.impressions ?? 0, clicks: g.clicks ?? 0, conversions: r(g.conversions), conversions_value: r(g.conversionsValue) },
    meta: { spend: r(m.spend), impressions: m.impressions ?? 0, clicks: m.clicks ?? 0, conversions: r(m.conversions), purchase_value: r(m.purchaseValue), leads: m.leads ?? 0 },
    tiktok: { spend: r(t.spend), impressions: t.impressions ?? 0, clicks: t.clicks ?? 0, conversions: r(t.conversions) },
    totals: {
      spend: totalSpend,
      conversions: totalConversions,
      cost_per_conversion: totalConversions > 0 ? r(totalSpend / totalConversions) : null,
    },
    note: totalSpend === 0 ? "אין נתונים לתקופה זו — ייתכן שהחיבור לא סונכרן או שאין הוצאה." : undefined,
  };
}

const SYSTEM_PROMPT = `אתה עוזר טלגרם של סוכנות שיווק דיגיטלי (DigiTailors).
אתה מתקשר בעברית, בסגנון קצר וברור. מטבע: ₪ (שקלים). תאריך היום: {TODAY}.

יש לך שני כלים:
1. create_task — לפתיחת משימה. שייך אותה ללקוח אם הוזכר. אם לא ברור מה העדיפות, אל תשאל — קבע medium.
2. get_campaign_data — לשליפת ביצועי קמפיינים של לקוח כשנשאלת על נתונים/הוצאה/המרות.

כללים:
- כשפותחים משימה — אשר בקצרה למי היא שויכה ולאיזה לקוח.
- כשמציגים נתוני קמפיין — סכם את העיקר (הוצאה, המרות, עלות להמרה) בנקודות קצרות, בלי טבלאות ענקיות.
- אם כלי החזיר client_not_found — אל תפתח את המשימה ואל תנחש לקוח. אמור למשתמש שלא נמצא לקוח מתאים, הצג את השמות הקרובים (suggestions) ובקש שיכתוב את השם המדויק מהרשימה. אם המשתמש מאשר במפורש שאין לקוח — אפשר לפתוח את המשימה בלי שם לקוח (בלי הפרמטר client_name).
- אל תמציא נתונים או שמות לקוחות. השתמש רק במה שהכלים מחזירים.`;

/**
 * מריץ את ה-assistant על הודעה נכנסת ומחזיר טקסט תשובה.
 */
export async function runCampaignAssistant(text: string): Promise<string> {
  const system = SYSTEM_PROMPT.replace("{TODAY}", ymd(new Date()));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: text }];

  // לולאת agent — מריץ כלים עד שמתקבלת תשובת טקסט סופית (מקסימום 4 סבבים)
  for (let i = 0; i < 4; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      tools,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      const replyText = textBlock && "text" in textBlock ? textBlock.text : "";
      return replyText.trim() || "לא הצלחתי לעבד את הבקשה. נסה לנסח מחדש.";
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        if (block.name === "create_task") {
          result = await createTask(block.input as Parameters<typeof createTask>[0]);
        } else if (block.name === "get_campaign_data") {
          result = await getCampaignData(block.input as Parameters<typeof getCampaignData>[0]);
        } else {
          result = { error: `כלי לא מוכר: ${block.name}` };
        }
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "שגיאה בהרצת הכלי" };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "הבקשה מורכבת מדי לעיבוד אוטומטי. נסה לפצל אותה.";
}
