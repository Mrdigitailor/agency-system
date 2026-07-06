import { prisma } from "@/lib/db/prisma";

/**
 * בניית system prompt אוטומטית מתעודת הזהות וביצועי הלקוח
 */
export async function buildSystemPrompt(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { optimizations: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  if (!client) return "אתה יועץ שיווק דיגיטלי.";

  const profile = await prisma.clientProfile.findUnique({ where: { clientId } });

  // ביצועי החודש
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const insights = await prisma.metaInsightDaily.findMany({
    where: { clientId, level: "campaign", date: { gte: monthStart } },
  });
  const totalSpend = insights.reduce((s, i) => s + i.spend, 0);
  const totalConversions = insights.reduce((s, i) => s + i.conversions, 0);
  const totalPurchaseValue = insights.reduce((s, i) => s + i.purchaseValue, 0);
  const roas = totalSpend > 0 ? (totalPurchaseValue / totalSpend).toFixed(2) : "N/A";
  const cpa = totalConversions > 0 ? Math.round(totalSpend / totalConversions) : 0;

  // משימות פתוחות
  const tasks = await prisma.task.findMany({
    where: { clientId, status: { not: "done" }, deletedAt: null },
    select: { title: true, priority: true, dueDate: true },
    take: 10,
  });

  // פרופיל
  const products = profile ? JSON.parse(profile.products ?? "[]") : [];
  const audiences = profile ? JSON.parse(profile.audiences ?? "{}") : {};
  const awarenessLevels = profile ? JSON.parse(profile.awarenessLevels ?? "[]") : [];
  const competitors = profile ? JSON.parse(profile.competitors ?? "[]") : [];
  const languages = profile ? JSON.parse(profile.marketingLanguages ?? "[]") : [];

  let prompt = `אתה יועץ שיווק דיגיטלי מומחה שעובד בסוכנות Mr.digitailor. אתה מכיר לעומק את הלקוח הבא:

**פרטי העסק:**
- שם: ${client.name}
- תחום: ${profile?.businessSector || client.clientType || "לא צוין"}
- תיאור: ${profile?.businessDescription || "לא צוין"}
- אזור שירות: ${profile?.serviceArea || "לא צוין"}
- אתר: ${client.website || "אין"}

**USP ומיצוב:**
- USP: ${profile?.usp || "לא הוגדר"}
- יתרונות: ${profile?.competitiveAdvantage || "לא צוין"}
- התנגדויות נפוצות: ${profile?.objections || "לא צוין"}`;

  if (products.length > 0) {
    prompt += `\n\n**מוצרים ושירותים:**\n${products.map((p: { name: string; description: string }) => `- ${p.name}: ${p.description}`).join("\n")}`;
  }

  if (awarenessLevels.length > 0) {
    prompt += `\n\n**קהלי יעד (רמות מודעות):** ${awarenessLevels.join(", ")}`;
    for (const level of awarenessLevels) {
      const aud = audiences[level];
      if (aud) {
        prompt += `\n  ${level}: דמוגרפיה: ${aud.demographics || "—"}, עניינים: ${aud.interests || "—"}`;
      }
    }
  }

  prompt += `\n\n**שפה וטון:**
- טון: ${profile?.toneOfVoice || "ידידותי"}
- שפות: ${languages.join(", ") || "עברית"}
- מילים אסורות: ${profile?.forbiddenWords || "אין"}
- פנייה: ${profile?.addressStyle || "אתה"}`;

  if (competitors.length > 0) {
    prompt += `\n\n**מתחרים:**\n${competitors.map((c: { name: string }) => `- ${c.name}`).join("\n")}`;
  }

  prompt += `\n\n**ביצועים — החודש הנוכחי:**
- הוצאה: ₪${Math.round(totalSpend).toLocaleString()}
- המרות: ${totalConversions}
- עלות להמרה: ₪${cpa}
- ROAS: ${roas}
- תקציב חודשי: ₪${client.monthlyBudget.toLocaleString()}`;

  if (client.optimizations.length > 0) {
    prompt += `\n\n**אופטימיזציות אחרונות:**\n${client.optimizations.map((o) => `- ${o.date}: ${o.description}`).join("\n")}`;
  }

  if (tasks.length > 0) {
    prompt += `\n\n**משימות פתוחות:**\n${tasks.map((t) => `- ${t.title} (${t.priority}, יעד: ${t.dueDate || "—"})`).join("\n")}`;
  }

  prompt += `\n\n**יעדים:**
- יעד המרות: ${client.targetConversions}
- יעד עלות להמרה: ₪${client.targetCostPerConversion}

ענה תמיד בעברית, בצורה מקצועית אבל ידידותית.
כשאתה נותן המלצות — התבסס על הנתונים האמיתיים.
כשאתה מציע טקסטים שיווקיים — כתוב בטון ${profile?.toneOfVoice || "ידידותי"} ופנה ב-${profile?.addressStyle || "אתה"}.`;

  return prompt;
}
