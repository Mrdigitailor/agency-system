import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const dirty = await prisma.platformConnection.findMany({
    where: { accountName: { contains: "TOKEN_EXPIRED" } },
    select: { id: true, accountName: true },
  });

  console.log(`Found ${dirty.length} connections with TOKEN_EXPIRED in name`);

  for (const conn of dirty) {
    const clean = conn.accountName.replace(/\s*\[TOKEN_EXPIRED\]/g, "").trim();
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: { accountName: clean },
    });
    console.log(`  Fixed: "${conn.accountName}" → "${clean}"`);
  }

  console.log("Done!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
