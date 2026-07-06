// שאלון אונבורדינג ללקוח — טיפוסי תשובות + מיפוי לתעודת הזהות.
// עיקרון: תשובות הלקוח ממלאות רק שדות *ריקים* בפרופיל — לעולם לא דורסות מידע שהסוכנות הזינה.
import { prisma } from "@/lib/db/prisma";
import { todayIL } from "@/lib/utils/ildate";

export interface QuestionnaireAnswers {
  businessDescription: string;
  serviceArea: string; // local | national | international | ""
  serviceAreaDetails: string;
  products: Array<{ name: string; description: string; priceRange: string; promotions: string }>;
  usp: string;
  whyChooseUs: string;
  socialProof: string;
  idealCustomer: string;
  objections: string;
  competitors: Array<{ name: string; website: string }>;
  toneOfVoice: string;
  addressStyle: string;
  forbiddenWords: string;
  assetBankUrl: string;
  existingAssets: string; // חשבונות/גישות/פיקסלים קיימים — טקסט חופשי
}

export const EMPTY_ANSWERS: QuestionnaireAnswers = {
  businessDescription: "", serviceArea: "", serviceAreaDetails: "",
  products: [], usp: "", whyChooseUs: "", socialProof: "", idealCustomer: "",
  objections: "", competitors: [], toneOfVoice: "", addressStyle: "",
  forbiddenWords: "", assetBankUrl: "", existingAssets: "",
};

export function parseAnswers(raw: string): QuestionnaireAnswers {
  try {
    const parsed = JSON.parse(raw || "{}");
    return { ...EMPTY_ANSWERS, ...parsed };
  } catch {
    return { ...EMPTY_ANSWERS };
  }
}

function isEmptyJsonArray(value: string): boolean {
  try { return (JSON.parse(value || "[]") as unknown[]).length === 0; } catch { return true; }
}

/** ממפה תשובות שאלון לשדות ריקים ב-ClientProfile. מחזיר אילו שדות עודכנו. */
export async function applyAnswersToProfile(clientId: string, a: QuestionnaireAnswers): Promise<string[]> {
  let profile = await prisma.clientProfile.findUnique({ where: { clientId } });
  if (!profile) profile = await prisma.clientProfile.create({ data: { clientId } });

  const data: Record<string, string> = {};

  const textFields: Array<[keyof QuestionnaireAnswers, keyof typeof profile]> = [
    ["businessDescription", "businessDescription"],
    ["serviceArea", "serviceArea"],
    ["serviceAreaDetails", "serviceAreaDetails"],
    ["usp", "usp"],
    ["whyChooseUs", "whyChooseUs"],
    ["socialProof", "socialProof"],
    ["objections", "objections"],
    ["toneOfVoice", "toneOfVoice"],
    ["addressStyle", "addressStyle"],
    ["forbiddenWords", "forbiddenWords"],
    ["assetBankUrl", "assetBankUrl"],
  ];
  for (const [from, to] of textFields) {
    const answer = String(a[from] ?? "").trim();
    const current = String(profile[to] ?? "").trim();
    if (answer && !current) data[to as string] = answer;
  }

  const validProducts = a.products.filter((p) => p.name.trim());
  if (validProducts.length && isEmptyJsonArray(profile.products)) {
    data.products = JSON.stringify(validProducts.map((p) => ({
      name: p.name, description: p.description, priceRange: p.priceRange,
      pricingModel: "", seasonality: "", promotions: p.promotions,
    })));
  }

  const validCompetitors = a.competitors.filter((c) => c.name.trim());
  if (validCompetitors.length && isEmptyJsonArray(profile.competitors)) {
    data.competitors = JSON.stringify(validCompetitors.map((c) => ({
      name: c.name, website: c.website, facebook: "", instagram: "", adLibrary: "",
      strengths: "", weaknesses: "", notes: "מתוך שאלון האונבורדינג",
    })));
  }

  // תשובות שאין להן שדה ייעודי — נשמרות כהערה פנימית מסודרת
  const noteParts: string[] = [];
  if (a.idealCustomer.trim()) noteParts.push(`👤 הלקוח האידיאלי (במילים של הלקוח):\n${a.idealCustomer.trim()}`);
  if (a.existingAssets.trim()) noteParts.push(`🔑 חשבונות וגישות קיימים:\n${a.existingAssets.trim()}`);
  if (noteParts.length) {
    let notes: Array<{ content: string; date: string; author: string }> = [];
    try { notes = JSON.parse(profile.internalNotes || "[]"); } catch {}
    notes.unshift({ content: `תשובות שאלון אונבורדינג:\n\n${noteParts.join("\n\n")}`, date: todayIL(), author: "שאלון לקוח" });
    data.internalNotes = JSON.stringify(notes);
  }

  if (Object.keys(data).length) {
    await prisma.clientProfile.update({ where: { clientId }, data });
  }
  return Object.keys(data);
}
