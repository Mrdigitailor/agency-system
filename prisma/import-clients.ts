import { PrismaClient } from "../src/generated/prisma";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDate(dateStr: string): string {
  if (!dateStr) return "";
  // DD/MM/YYYY → YYYY-MM-DD
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return dateStr;
}

async function main() {
  const csvPath = path.resolve(__dirname, "../Clients.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const headers = parseCSVLine(lines[0]);

  console.log("Headers:", headers);
  console.log(`Found ${lines.length - 1} clients to import\n`);

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    const name = row["Name"]?.trim();
    if (!name) continue;

    // בדיקה אם הלקוח כבר קיים
    const existing = await prisma.client.findFirst({ where: { name } });
    if (existing) {
      console.log(`⏭️  "${name}" — כבר קיים, מדלג`);
      skipped++;
      continue;
    }

    const platforms: string[] = [];
    if (row["Facebook"]) platforms.push("Meta");
    if (row["Google My Business"]) platforms.push("Google Ads");
    if (row["TikTok"]) platforms.push("TikTok");

    await prisma.client.create({
      data: {
        name,
        contactEmail: row["Email"] ?? "",
        contactPhone: (row["Phone"] ?? "").replace(/[^\d+\-\s]/g, "").trim(),
        status: row["Status"] === "active" ? "active" : "active",
        website: row["Website"] ?? "",
        facebookPage: row["Facebook"] ?? "",
        instagram: row["Instagram"] ?? "",
        linkedin: row["LinkedIn"] ?? "",
        notes: [
          row["Contact Person"] ? `איש קשר: ${row["Contact Person"]}` : "",
          row["Legal Type"] ? `סוג: ${row["Legal Type"]}` : "",
          row["Address"] ? `כתובת: ${row["Address"]}` : "",
        ].filter(Boolean).join("\n"),
        platforms: JSON.stringify(platforms),
        monthlyBudget: parseFloat(row["Monthly Budget"]) || 0,
        targetConversions: parseInt(row["Conversion Goal"]) || 0,
        targetCostPerConversion: parseFloat(row["Target CPL"]) || 0,
        clientType: "לידים",
        campaignManager: row["Account Manager"] === "gal@digitailors.co.il" ? "גל" : "",
        manager: row["Account Manager"] ?? "",
      },
    });

    console.log(`✅ "${name}" — יובא בהצלחה`);
    imported++;
  }

  console.log(`\n=== סיום ===`);
  console.log(`יובאו: ${imported}`);
  console.log(`דולגו (כבר קיימים): ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
