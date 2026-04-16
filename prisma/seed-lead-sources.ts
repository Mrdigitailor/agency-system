import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const DEFAULT_SOURCES = [
  "טופס לידים",
  "ממליץ / הפניה",
  "אינסטגרם",
  "פייסבוק",
  "לינקדאין",
  "גוגל",
  "אתר",
  "פנייה אישית (טלפון/ווטסאפ)",
  "אירוע / כנס",
  "אחר",
];

async function main() {
  for (const name of DEFAULT_SOURCES) {
    await prisma.leadSource.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${DEFAULT_SOURCES.length} lead sources`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
