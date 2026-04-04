import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const defaultPw = await bcrypt.hash("123456", 12);
  // ניקוי
  await prisma.taskNote.deleteMany();
  await prisma.leadCall.deleteMany();
  await prisma.optimization.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.report.deleteMany();
  await prisma.task.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.agencySettings.deleteMany();

  // עובדים
  const shachar = await prisma.user.create({ data: { name: "סער", email: "saar@digitailors.co.il", password: defaultPw, role: "admin", phone: "050-1234567" } });
  const dana = await prisma.user.create({ data: { name: "דנה", email: "dana@digitailors.co.il", password: defaultPw, role: "manager", phone: "050-2345678" } });
  const yossi = await prisma.user.create({ data: { name: "יוסי", email: "yossi@digitailors.co.il", password: defaultPw, role: "campaignManager", phone: "050-3456789" } });
  const noa = await prisma.user.create({ data: { name: "נועה", email: "noa@digitailors.co.il", password: defaultPw, role: "campaignManager", phone: "050-4567890" } });

  // לקוחות
  const alpha = await prisma.client.create({
    data: {
      name: "אלפא מדיה", manager: "סער", campaignManager: "סער", managerId: shachar.id,
      platforms: JSON.stringify(["Meta", "Google Ads"]),
      monthlyBudget: 45000, clientType: "לידים", status: "active",
      contactEmail: "info@alpha.co.il", contactPhone: "03-1111111",
      notes: "לקוח ותיק, מרוצה מהביצועים",
      metaAdAccount: "act_123456789", googleAdAccount: "123-456-7890",
      facebookPage: "https://facebook.com/alphamedia", instagram: "https://instagram.com/alphamedia",
      website: "https://alpha.co.il",
      budgetUsed: 38500, avgCostPerConversion: 45, targetCostPerConversion: 50,
      conversionsThisMonth: 856, targetConversions: 900, lastOptimization: "2026-03-30",
    },
  });

  const beta = await prisma.client.create({
    data: {
      name: "בטא סולושנס", manager: "דנה", campaignManager: "דנה", managerId: dana.id,
      platforms: JSON.stringify(["Meta", "TikTok"]),
      monthlyBudget: 32000, clientType: "ecom", status: "upsell",
      contactEmail: "contact@beta.co.il", contactPhone: "03-2222222",
      notes: "ROAS מעולה, אפשר להרחיב תקציב",
      metaAdAccount: "act_987654321", tiktokAdAccount: "tiktok_beta_001",
      facebookPage: "https://facebook.com/betasolutions", instagram: "https://instagram.com/betasolutions",
      linkedin: "https://linkedin.com/company/betasolutions", website: "https://beta.co.il",
      budgetUsed: 29800, avgCostPerConversion: 28, targetCostPerConversion: 35,
      conversionsThisMonth: 1064, targetConversions: 800, lastOptimization: "2026-04-01",
    },
  });

  const gamma = await prisma.client.create({
    data: {
      name: "גמא טכנולוגיות", manager: "יוסי", campaignManager: "יוסי", managerId: yossi.id,
      platforms: JSON.stringify(["Google Ads"]),
      monthlyBudget: 18000, clientType: "שירותי", status: "at_risk",
      contactEmail: "hello@gamma.co.il", contactPhone: "03-3333333",
      notes: "ירידה בביצועים, צריך אופטימיזציה",
      googleAdAccount: "321-654-0987",
      linkedin: "https://linkedin.com/company/gammatech", website: "https://gamma.co.il",
      budgetUsed: 17200, avgCostPerConversion: 95, targetCostPerConversion: 60,
      conversionsThisMonth: 181, targetConversions: 350, lastOptimization: "2026-03-18",
    },
  });

  // אופטימיזציות
  await prisma.optimization.createMany({
    data: [
      { clientId: alpha.id, date: "2026-03-30", description: "עדכון קהלים בקמפיין Meta — הורדת CPA ב-12%" },
      { clientId: alpha.id, date: "2026-03-22", description: "הוספת מילות שלילה ב-Google Ads" },
      { clientId: alpha.id, date: "2026-03-15", description: "בדיקת A/B לקריאייטיב חדש" },
      { clientId: beta.id, date: "2026-04-01", description: "הרחבת קמפיין TikTok — ROAS 5.2" },
      { clientId: beta.id, date: "2026-03-25", description: "עדכון קטלוג מוצרים בדינמי" },
      { clientId: gamma.id, date: "2026-03-18", description: "ניסיון שיפור דפי נחיתה — לא הצליח" },
    ],
  });

  // משימות
  const t1 = await prisma.task.create({ data: { title: "אופטימיזציית קמפיין Meta", description: "לבדוק ביצועי קהלים ולעדכן targeting", clientId: alpha.id, assignee: "סער", assigneeId: shachar.id, priority: "high", dueDate: "2026-04-05", status: "in_progress", taskType: "advertising", platform: "Meta" } });
  await prisma.task.create({ data: { title: "הכנת דוח חודשי", description: "דוח מרץ עם סיכום ביצועים והמלצות", clientId: beta.id, assignee: "דנה", assigneeId: dana.id, priority: "medium", dueDate: "2026-04-07", status: "pending", taskType: "other" } });
  await prisma.task.create({ data: { title: "הקמת קמפיין Google Ads", description: "קמפיין חיפוש חדש למוצר החדש", clientId: gamma.id, assignee: "יוסי", assigneeId: yossi.id, priority: "urgent", dueDate: "2026-04-01", status: "pending", taskType: "advertising", platform: "Google Ads" } });
  const t4 = await prisma.task.create({ data: { title: "עדכון קריאייטיב TikTok", description: "עדכון באנרים לקמפיין TikTok", clientId: beta.id, assignee: "נועה", assigneeId: noa.id, priority: "low", dueDate: "2026-04-10", status: "done", taskType: "advertising", platform: "TikTok" } });
  await prisma.task.create({ data: { title: "פגישת סטטוס עם לקוח", description: "לדון בביצועים ולתכנן את החודש הבא", clientId: alpha.id, assignee: "סער", assigneeId: shachar.id, priority: "medium", dueDate: "2026-04-02", status: "in_progress", taskType: "other" } });

  // הערות משימה
  await prisma.taskNote.create({ data: { taskId: t1.id, authorName: "שחר", authorId: shachar.id, content: "בדקתי את הקהלים, נראה שלוקסייל הכי חזק" } });
  await prisma.taskNote.create({ data: { taskId: t4.id, authorName: "נועה", authorId: noa.id, content: "הבאנרים מוכנים ועלו" } });

  // לידים
  const lead1 = await prisma.lead.create({
    data: {
      name: "דלתא שיווק", email: "info@delta.co.il", phone: "050-5555555",
      company: "דלתא שיווק בע״מ", website: "https://delta.co.il",
      digitalAssets: "עמוד פייסבוק עם 5K עוקבים", estimatedBudget: "20,000-30,000",
      salesPerson: "סער", interestedServices: JSON.stringify(["ניהול קמפיינים", "סושיאל"]),
      source: "referral", status: "meeting_set", value: 25000,
      notes: "הגיעו דרך אלפא מדיה", nextFollowUp: "2026-04-05",
      internalNotes: "להכין הצעה לפני הפגישה",
    },
  });
  await prisma.lead.create({
    data: {
      name: "אפסילון דיגיטל", email: "contact@epsilon.co.il", phone: "050-6666666",
      company: "אפסילון בע״מ", estimatedBudget: "10,000-15,000",
      salesPerson: "דנה", interestedServices: JSON.stringify(["SEO", "אתרים"]),
      source: "website", status: "new", value: 15000,
      notes: "מילאו טופס באתר", nextFollowUp: "2026-04-04",
    },
  });

  // שיחות ליד
  await prisma.leadCall.createMany({
    data: [
      { leadId: lead1.id, date: "2026-03-28", summary: "שיחה ראשונית — מעוניינים בהצעת מחיר", callerName: "סער" },
      { leadId: lead1.id, date: "2026-03-30", summary: "נקבעה פגישה ל-5 באפריל", callerName: "סער" },
    ],
  });

  // הגדרות סוכנות
  await prisma.agencySettings.create({ data: { id: "default", agencyName: "DigiTailors" } });

  console.log("✅ Seed completed");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
