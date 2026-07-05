// תבנית משימות אונבורדינג ללקוח חדש — הרשימה שסוכם עליה עם הבעלים.
// ימים נספרים מרגע הפעלת האונבורדינג (= הכנסת הלקוח).
import type { SiteScanResult } from "./site-scan";

export interface OnboardingTaskInput {
  title: string;
  description: string;
  dueDays: number;
  assignTo: "campaignManager" | "admin";
  priority: "low" | "medium" | "high" | "urgent";
  platform: string;
}

interface ClientForOnboarding {
  clientType: string;
  platforms: string[];
  website: string;
  metaAdAccount: string;
  googleAdAccount: string;
  tiktokAdAccount: string;
}

// ==================== משימות קבועות ====================

const STANDARD_TASKS: OnboardingTaskInput[] = [
  {
    title: "אונבורדינג: לוודא שהלקוח מילא שאלון",
    description: "לוודא שהלקוח קיבל את שאלון האונבורדינג ומילא אותו. אם לא מילא — תזכורת טלפונית.",
    dueDays: 1, assignTo: "campaignManager", priority: "high", platform: "",
  },
  {
    title: "אונבורדינג: קבלת גישות מהלקוח",
    description: "לקבל גישות: Business Manager של מטא, חשבון Google Ads, GA4, אתר (או מנהל האתר), ודפי הסושיאל.",
    dueDays: 1, assignTo: "campaignManager", priority: "high", platform: "",
  },
  {
    title: "אונבורדינג: חיבור החשבונות למערכת",
    description: "לחבר את חשבונות הפרסום של הלקוח למערכת (חיבורי פלטפורמה בכרטיס הלקוח) ולוודא שהסנכרון היומי מושך נתונים.",
    dueDays: 1, assignTo: "campaignManager", priority: "high", platform: "",
  },
  {
    title: "אונבורדינג: הגדרת אירועי המרה",
    description: "להגדיר אירוע המרה במטא ופעולת המרה בגוגל, לעדכן אותם בכרטיס הלקוח, ולבדוק שהאירועים יורים בפועל.",
    dueDays: 2, assignTo: "campaignManager", priority: "high", platform: "",
  },
  {
    title: "אונבורדינג: הגדרת יעדים ללקוח",
    description: "להגדיר בכרטיס הלקוח: תקציב חודשי, יעד מחיר להמרה ויעד כמות המרות.",
    dueDays: 5, assignTo: "admin", priority: "medium", platform: "",
  },
  {
    title: "אונבורדינג: מחקר מתחרים",
    description: "מחקר מתחרים מעמיק: מי המתחרים המרכזיים, מה הם מפרסמים (ספריית המודעות של מטא), חוזקות/חולשות. לתעד בטאב תעודת זהות → מתחרים.",
    dueDays: 7, assignTo: "campaignManager", priority: "medium", platform: "",
  },
  {
    title: "אונבורדינג: דוח שבועי ודשבורד ללקוח",
    description: "להגדיר פורמט דוח שבועי בטאב תעודת זהות, ולהקים דשבורד ציבורי ללקוח בטאב דוחות ודשבורד.",
    dueDays: 7, assignTo: "campaignManager", priority: "medium", platform: "",
  },
  {
    title: "אונבורדינג: פגישת קיק-אוף עם הלקוח",
    description: "לתאם ולקיים פגישת פתיחה: היכרות, תיאום ציפיות, אישור כיוון אסטרטגי ולוחות זמנים.",
    dueDays: 7, assignTo: "admin", priority: "medium", platform: "",
  },
  {
    title: "אונבורדינג: אסטרטגיית פרסום",
    description: "לבנות אסטרטגיית פרסום על בסיס תעודת הזהות ומחקר המתחרים, ולאשר אותה מול הלקוח.",
    dueDays: 10, assignTo: "campaignManager", priority: "high", platform: "",
  },
  {
    title: "אונבורדינג: הקמת קמפיינים ראשונים",
    description: "להקים את הקמפיינים הראשונים לפי האסטרטגיה המאושרת.",
    dueDays: 14, assignTo: "campaignManager", priority: "high", platform: "",
  },
];

// משימת לידים — רק ללקוח שאינו איקומרס
const LEADS_TASK: OnboardingTaskInput = {
  title: "אונבורדינג: בדיקת קבלת לידים ואוטומציות",
  description: "לוודא שהלידים מהקמפיינים מגיעים ללקוח (טופס/דף נחיתה → CRM/מייל/וואטסאפ). אם אין זרימה מסודרת — להקים אוטומציה להעברת לידים.",
  dueDays: 3, assignTo: "campaignManager", priority: "high", platform: "",
};

// ==================== משימות מותנות בממצאים ====================

const PLATFORM_ACCOUNT_FIELDS: Array<{ platform: string; field: keyof ClientForOnboarding }> = [
  { platform: "Meta", field: "metaAdAccount" },
  { platform: "Google Ads", field: "googleAdAccount" },
  { platform: "TikTok", field: "tiktokAdAccount" },
];

export function buildOnboardingTasks(client: ClientForOnboarding, scan: SiteScanResult | null): OnboardingTaskInput[] {
  const tasks: OnboardingTaskInput[] = [...STANDARD_TASKS];

  // לקוח לידים/שירותי (לא איקומרס) → בדיקת זרימת לידים
  if (client.clientType !== "ecom") tasks.push(LEADS_TASK);

  // חשבונות מודעות חסרים בפלטפורמות שהלקוח אמור לפרסם בהן
  for (const { platform, field } of PLATFORM_ACCOUNT_FIELDS) {
    if (client.platforms.includes(platform) && !String(client[field] ?? "").trim()) {
      tasks.push({
        title: `אונבורדינג: פתיחת חשבון מודעות ${platform}`,
        description: `הלקוח מתוכנן לפרסם ב-${platform} אבל אין חשבון מודעות בכרטיס. לבדוק אם קיים חשבון — ואם לא, לפתוח חדש ולעדכן בכרטיס הלקוח.`,
        dueDays: 2, assignTo: "campaignManager", priority: "high", platform,
      });
    }
  }

  // ממצאי סריקת האתר
  if (!client.website.trim()) {
    tasks.push({
      title: "אונבורדינג: השלמת כתובת אתר ובדיקת קודי מעקב",
      description: "אין כתובת אתר בכרטיס הלקוח, ולכן לא בוצעה סריקת קודי מעקב. להשלים את הכתובת (או לוודא שאין אתר) ולבדוק ידנית פיקסל מטא ו-GA4.",
      dueDays: 2, assignTo: "campaignManager", priority: "high", platform: "",
    });
  } else if (scan && !scan.ok) {
    tasks.push({
      title: "אונבורדינג: בדיקת האתר וקודי המעקב ידנית",
      description: `הסריקה האוטומטית של ${scan.url} נכשלה (${scan.error ?? "סיבה לא ידועה"}). לבדוק ידנית שהאתר תקין ושפיקסל מטא ו-GA4 מוטמעים.`,
      dueDays: 2, assignTo: "campaignManager", priority: "high", platform: "",
    });
  } else if (scan?.ok) {
    if (!scan.hasMetaPixel) {
      tasks.push(scan.hasGTM ? {
        title: "אונבורדינג: לוודא שפיקסל מטא פעיל",
        description: `באתר ${scan.url} נמצא GTM אבל לא זוהה פיקסל מטא ישיר — ייתכן שהוא מוטמע דרך ה-GTM. לוודא עם Meta Pixel Helper שהפיקסל יורה, ואם לא — להטמיע.`,
        dueDays: 3, assignTo: "campaignManager", priority: "medium", platform: "Meta",
      } : {
        title: "אונבורדינג: הטמעת פיקסל מטא באתר",
        description: `בסריקת האתר ${scan.url} לא נמצא פיקסל מטא. להטמיע פיקסל ולוודא שהוא יורה (Meta Pixel Helper).`,
        dueDays: 3, assignTo: "campaignManager", priority: "high", platform: "Meta",
      });
    }
    if (!scan.hasGA4) {
      tasks.push(scan.hasGTM ? {
        title: "אונבורדינג: לוודא ש-GA4 פעיל",
        description: `באתר ${scan.url} נמצא GTM אבל לא זוהה GA4 ישיר — ייתכן שהוא מוטמע דרך ה-GTM. לוודא ב-GA4 Realtime שנכנסים נתונים, ואם לא — להטמיע.`,
        dueDays: 3, assignTo: "campaignManager", priority: "medium", platform: "",
      } : {
        title: "אונבורדינג: הטמעת GA4 באתר",
        description: `בסריקת האתר ${scan.url} לא נמצא קוד GA4. להטמיע (רצוי דרך GTM) ולוודא שנכנסים נתונים ב-Realtime.`,
        dueDays: 3, assignTo: "campaignManager", priority: "medium", platform: "",
      });
    }
    if (client.platforms.includes("TikTok") && !scan.hasTikTokPixel) {
      tasks.push({
        title: "אונבורדינג: הטמעת פיקסל טיקטוק באתר",
        description: `הלקוח מפרסם בטיקטוק אבל בסריקת האתר ${scan.url} לא נמצא פיקסל טיקטוק. להטמיע ולוודא שהוא יורה.`,
        dueDays: 3, assignTo: "campaignManager", priority: "medium", platform: "TikTok",
      });
    }
  }

  return tasks;
}
