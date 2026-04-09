import { PrismaClient } from "../src/generated/prisma";
import XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();

function excelDateToISO(serial: number | string): string {
  if (!serial) return "";
  if (typeof serial === "string") return serial;
  // Excel serial date → JS Date
  const d = new Date((serial - 25569) * 86400 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clean(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function cleanPhone(val: unknown): string {
  const s = clean(val);
  if (!s) return "";
  // Convert 9720521234567 → 052-1234567
  const num = s.replace(/[^\d+]/g, "");
  if (num.startsWith("972") && num.length >= 12) {
    return "0" + num.slice(3);
  }
  return num;
}

const STATUS_MAP: Record<string, string> = {
  "ליד חדש": "new",
  "ממתין לעדכון": "contacted",
  "ללא מענה - פולואפ": "contacted",
  "לא רלוונטי": "lost",
  "נסגר": "won",
  "סיימו פעילות": "lost",
  "נשלחה הצעת מחיר": "proposal_sent",
  "טווח רחוק": "new",
};

async function importLeads() {
  console.log("\n=== ייבוא לידים ===");
  const wb = XLSX.readFile(path.resolve(__dirname, "../ייצוא לידים.xlsx"));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][];

  // שורה 2 = headers
  const headers = raw[2] as string[];
  const col = (name: string) => headers.indexOf(name);

  let imported = 0, skipped = 0, currentGroup = "";

  for (let i = 3; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row.length === 0) continue;

    // Group row detection
    const firstCell = clean(row[0]);
    if (row.filter(Boolean).length <= 2 && firstCell && !row[col("טלפון")]) {
      currentGroup = firstCell;
      continue;
    }

    const name = firstCell;
    if (!name || name === "Name") continue;

    try {
      await prisma.lead.create({
        data: {
          name,
          phone: cleanPhone(row[col("טלפון")]),
          email: clean(row[col("אימייל")]),
          leadInstagram: clean(row[col("אינסטגרם")]),
          leadFacebookPage: clean(row[col("פייסבוק")]),
          website: clean(row[col("אתר")]),
          quality: clean(row[col("איכות ליד")]),
          priority: clean(row[col("רמת ליד")]),
          source: clean(row[col("מקור מפנה")]) || "other",
          proposalUrl: clean(row[col("קישור להצעת המחיר")]),
          dealValue: parseFloat(clean(row[col("סכום עסקה חד פעמי")])) || 0,
          monthlyValue: parseFloat(clean(row[col("סכום שירות חודשי")])) || 0,
          contractSigned: clean(row[col("הסכם חתום")]) === "V" || clean(row[col("הסכם חתום")]) === "כן",
          contractUrl: clean(row[col("קישור הסכם חתום")]),
          serviceType: clean(row[col("סוג שירות")]),
          proposalSentAt: excelDateToISO(row[col("תאריך שליחת הצעה")] as number),
          status: STATUS_MAP[clean(row[col("סטטוס")])] ?? "new",
          stage: currentGroup,
          createdAt: row[col("תאריך כניסה")] ? new Date(excelDateToISO(row[col("תאריך כניסה")] as number) || new Date().toISOString()) : new Date(),
        },
      });
      imported++;
    } catch (err) {
      skipped++;
      if (imported === 0) console.error("  Error on first row:", err);
    }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
}

async function importSales() {
  console.log("\n=== ייבוא מכירות ===");
  const wb = XLSX.readFile(path.resolve(__dirname, "../מכירות.xlsx"));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][];

  const headers = raw[2] as string[];
  const col = (name: string) => headers.indexOf(name);

  let imported = 0, updated = 0, skipped = 0, currentGroup = "";

  for (let i = 3; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row.length === 0) continue;

    const firstCell = clean(row[0]);
    if (row.filter(Boolean).length <= 2 && firstCell && !row[col("שווי עסקה")]) {
      currentGroup = firstCell;
      continue;
    }

    const name = firstCell;
    if (!name || name === "Name") continue;

    const phone = cleanPhone(row[col("טלפון")] ?? row[col("Phone")]);
    const email = clean(row[col("אימייל")] ?? row[col("Email")]);

    // Try to match existing lead
    const existing = await prisma.lead.findFirst({
      where: {
        OR: [
          ...(name ? [{ name }] : []),
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    });

    const data = {
      contractUrl: clean(row[col("קישור להצעה חתומה")]),
      closedAt: excelDateToISO(row[col("תאריך סגירה")] as number),
      endDate: excelDateToISO(row[col("תאריך סיום")] as number),
      dealType: clean(row[col("סוג עסקה")]),
      dealValue: parseFloat(clean(row[col("שווי עסקה")])) || 0,
      minMonths: parseInt(clean(row[col("מינימום חודשי עבודה")])) || 0,
      lifetimeValue: parseFloat(clean(row[col("שווי חיי לקוח")])) || 0,
      status: "won",
      stage: currentGroup || "עסקאות סגורות",
      contractSigned: true,
    };

    try {
      if (existing) {
        await prisma.lead.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.lead.create({
          data: { name, phone, email, ...data },
        });
        imported++;
      }
    } catch {
      skipped++;
    }
  }

  console.log(`  Imported: ${imported}, Updated: ${updated}, Skipped: ${skipped}`);
}

async function importRecruitment() {
  console.log("\n=== ייבוא גיוסים ===");
  const wb = XLSX.readFile(path.resolve(__dirname, "../גיוסים.xlsx"));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][];

  const headers = raw[2] as string[];
  const col = (name: string) => headers.indexOf(name);

  const STAGE_MAP: Record<string, string> = {
    "נשלחה משימה לביצוע": "task_sent",
    "התקבלה מועמדות": "submitted",
    "ראיון": "interview",
    "התקבל": "accepted",
    "נדחה": "rejected",
  };

  let imported = 0, skipped = 0, currentGroup = "";

  for (let i = 3; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row.length === 0) continue;

    const firstCell = clean(row[0]);
    if (row.filter(Boolean).length <= 2 && firstCell) {
      currentGroup = firstCell;
      continue;
    }

    const name = firstCell;
    if (!name || name === "Name") continue;

    try {
      await prisma.recruitment.create({
        data: {
          name,
          email: clean(row[col("Email")]),
          phone: cleanPhone(row[col("Phone")]),
          experience: clean(row[col("שנות ניסיון")]),
          notes: clean(row[col("הערות")]),
          cvUrl: clean(row[col("קו״ח")]),
          stage: STAGE_MAP[clean(row[col("שלב")])] ?? "submitted",
          position: currentGroup,
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
}

async function importSuppliers() {
  console.log("\n=== ייבוא ספקים ===");
  const wb = XLSX.readFile(path.resolve(__dirname, "../ספקים.xlsx"));
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][];

  const headers = raw[2] as string[];
  const col = (name: string) => headers.indexOf(name);

  let imported = 0, skipped = 0, currentGroup = "";

  for (let i = 3; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (!row || row.length === 0) continue;

    const firstCell = clean(row[0]);
    if (row.filter(Boolean).length <= 2 && firstCell) {
      currentGroup = firstCell;
      continue;
    }

    const name = firstCell;
    if (!name || name === "Name") continue;

    try {
      await prisma.supplier.create({
        data: {
          name,
          type: clean(row[col("סוג איש קשר")]),
          field: clean(row[col("תחום")]),
          phone: cleanPhone(row[col("טלפון")]),
          role: clean(row[col("תפקיד")]),
          company: clean(row[col("שם חברה")]),
          email: clean(row[col("אימייל")]),
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  console.log(`  Imported: ${imported}, Skipped: ${skipped}`);
}

async function main() {
  console.log("=== Monday.com Import Script ===\n");
  await importLeads();
  await importSales();
  await importRecruitment();
  await importSuppliers();
  console.log("\n=== ✅ Import complete ===");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
