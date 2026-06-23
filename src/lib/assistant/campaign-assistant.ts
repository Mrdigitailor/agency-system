// מוח ה-assistant — מקבל הודעת טקסט, מריץ Claude עם tool-use, ומחזיר תשובה בעברית.
// פלטפורמה-אגנוסטי (משמש את בוט הטלגרם). יודע לפתוח משימות (עם שיוך אוטומטי)
// ולשלוף נתוני קמפיינים של לקוחות.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";

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

/** מציאת לקוח לפי שם — התאמה מדויקת ואז התאמה חלקית (case-insensitive) */
async function findClient(name: string) {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, campaignManagerId: true, campaignManager: true },
  });
  const lower = name.trim().toLowerCase();
  return (
    clients.find((c) => c.name.toLowerCase() === lower) ??
    clients.find((c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())) ??
    null
  );
}

async function createTask(input: {
  title: string;
  description?: string;
  client_name?: string;
  priority?: string;
  due_date?: string;
}) {
  const client = input.client_name ? await findClient(input.client_name) : null;

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

  return {
    ok: true,
    task_id: task.id,
    title: task.title,
    assigned_to: assigneeName || "לא שויך",
    client: client?.name ?? null,
    client_matched: input.client_name ? Boolean(client) : null,
    priority: task.priority,
    due_date: task.dueDate || null,
  };
}

async function getCampaignData(input: { client_name: string; days?: number }) {
  const client = await findClient(input.client_name);
  if (!client) return { error: `לא נמצא לקוח בשם "${input.client_name}".` };

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
- אם לא מצאת לקוח בשם שניתן — אמר זאת בפירוש ובקש שם מדויק.
- אל תמציא נתונים. השתמש רק במה שהכלים מחזירים.`;

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
