import { prisma } from "@/lib/db/prisma";

/**
 * מסנכרן את שיוך הלקוח למנהלים:
 * - מוסיף את clientId ל-assignedClientIds של העובדים הנבחרים בטופס
 * - מסיר את clientId מרשימות של עובדים אחרים שהיו משויכים ללקוח הזה קודם
 *
 * נקרא אחרי יצירה/עדכון של לקוח.
 */
export async function syncClientManagers(
  clientId: string,
  campaignManagerName: string,
  accountManagerName: string
) {
  const allUsers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["campaignManager", "manager", "admin"] } },
    select: { id: true, name: true, assignedClientIds: true },
  });

  const shouldHaveClient = new Set<string>();
  for (const u of allUsers) {
    if (u.name === campaignManagerName || u.name === accountManagerName) {
      shouldHaveClient.add(u.id);
    }
  }

  for (const user of allUsers) {
    const currentIds: string[] = JSON.parse(user.assignedClientIds ?? "[]");
    const hasClient = currentIds.includes(clientId);
    const shouldHave = shouldHaveClient.has(user.id);

    if (shouldHave && !hasClient) {
      // הוסף
      await prisma.user.update({
        where: { id: user.id },
        data: { assignedClientIds: JSON.stringify([...currentIds, clientId]) },
      });
    } else if (!shouldHave && hasClient) {
      // הסר
      await prisma.user.update({
        where: { id: user.id },
        data: { assignedClientIds: JSON.stringify(currentIds.filter((id) => id !== clientId)) },
      });
    }
  }
}
