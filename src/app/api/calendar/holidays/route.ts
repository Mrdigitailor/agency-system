import { NextResponse } from "next/server";

// ימים מיוחדים בינלאומיים (תאריכים קבועים)
const SPECIAL_DAYS: Record<string, string> = {
  "01-01": "יום השנה החדשה",
  "02-14": "ולנטיינס",
  "03-08": "יום האישה הבינלאומי",
  "03-20": "יום האושר",
  "04-22": "יום כדור הארץ",
  "05-01": "יום העבודה",
  "05-04": "Star Wars Day",
  "05-15": "יום המשפחה הבינלאומי",
  "06-05": "יום הסביבה",
  "06-21": "יום המוזיקה",
  "07-17": "יום האמוג׳י",
  "07-28": "יום ההמבורגר",
  "08-19": "יום הצילום",
  "09-21": "יום השלום",
  "10-01": "יום הקפה",
  "10-04": "יום בעלי החיים",
  "10-31": "ליל כל הקדושים",
  "11-11": "יום הרווקים (Singles Day)",
  "12-25": "חג המולד",
};

// Fallback — חגים ישראליים 2026 (אם Hebcal לא זמין)
const FALLBACK_2026: Array<{ date: string; title: string }> = [
  // מאומת מול Hebcal API
  { date: "2026-03-03", title: "פורים" },
  { date: "2026-04-01", title: "ערב פסח" },
  { date: "2026-04-02", title: "פסח א׳" },
  { date: "2026-04-08", title: "פסח ז׳" },
  { date: "2026-04-09", title: "פסח ח׳" },
  { date: "2026-04-16", title: "יום השואה" },
  { date: "2026-04-23", title: "יום הזיכרון" },
  { date: "2026-04-24", title: "יום העצמאות" },
  { date: "2026-05-22", title: "שבועות" },
  { date: "2026-09-11", title: "ערב ראש השנה" },
  { date: "2026-09-12", title: "ראש השנה א׳" },
  { date: "2026-09-13", title: "ראש השנה ב׳" },
  { date: "2026-09-20", title: "ערב יום כיפור" },
  { date: "2026-09-21", title: "יום כיפור" },
  { date: "2026-09-26", title: "סוכות" },
  { date: "2026-10-03", title: "שמחת תורה" },
  { date: "2026-12-12", title: "חנוכה" },
];

/**
 * GET /api/calendar/holidays?year=2026
 * שולף חגים ישראליים מ-Hebcal API + ימים מיוחדים בינלאומיים
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year") ?? new Date().getFullYear().toString();

  let hebrewHolidays: Array<{ date: string; title: string; category: string }> = [];

  // שאיבה מ-Hebcal
  try {
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&year=${year}&month=x&geo=none&lg=he`;
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    if (res.ok) {
      const data = await res.json();
      hebrewHolidays = (data.items ?? [])
        .filter((item: { category: string }) => ["holiday", "roshchodesh"].includes(item.category))
        .map((item: { date: string; title: string; hebrew: string; category: string; subcat?: string }) => ({
          date: item.date.split("T")[0],
          title: item.hebrew || item.title,
          category: item.subcat ?? item.category,
        }));
    }
  } catch (err) {
    console.warn("[Holidays] Hebcal API failed, using fallback:", err);
  }

  // Fallback אם Hebcal לא החזיר
  if (hebrewHolidays.length === 0 && year === "2026") {
    hebrewHolidays = FALLBACK_2026.map((h) => ({ ...h, category: "holiday" }));
  }

  // ימים מיוחדים בינלאומיים לשנה הזו
  const specialDays = Object.entries(SPECIAL_DAYS).map(([mmdd, title]) => ({
    date: `${year}-${mmdd}`,
    title,
    category: "special",
  }));

  // Black Friday + Cyber Monday (חישוב דינמי — יום שישי הרביעי + שני שאחריו בנובמבר)
  const nov1 = new Date(parseInt(year), 10, 1);
  let fourthThursday = 0;
  let count = 0;
  for (let d = 1; d <= 30; d++) {
    if (new Date(parseInt(year), 10, d).getDay() === 4) {
      count++;
      if (count === 4) { fourthThursday = d; break; }
    }
  }
  if (fourthThursday) {
    specialDays.push({
      date: `${year}-11-${String(fourthThursday + 1).padStart(2, "0")}`,
      title: "Black Friday",
      category: "special",
    });
    specialDays.push({
      date: `${year}-11-${String(fourthThursday + 4).padStart(2, "0")}`,
      title: "Cyber Monday",
      category: "special",
    });
  }

  return NextResponse.json({
    hebrewHolidays,
    specialDays,
  });
}
