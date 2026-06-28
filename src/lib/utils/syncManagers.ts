import { prisma } from "@/lib/db/prisma";

/** מתרגם שם מנהל ל-userId: התאמה מדויקת, ואז התאמת-יחיד לפי prefix/contains (למשל "גל"→"גל מאירוביץ"). */
export function pickUserIdByName(users: { id: string; name: string }[], name: string | null | undefined): string | null {
  const n = name?.trim();
  if (!n) return null;
  const exact = users.find((u) => u.name.trim() === n);
  if (exact) return exact.id;
  const partial = users.filter((u) => u.name.trim().startsWith(n) || u.name.trim().includes(n));
  return partial.length === 1 ? partial[0].id : null;
}

/** גרסה שטוענת בעצמה את המשתמשים — לשימוש מחוץ ל-syncClientManagers (למשל הבוט). */
export async function resolveManagerId(name: string | null | undefined): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const users = await prisma.user.findMany({ where: { isActive: true, role: { not: "client" } }, select: { id: true, name: true } });
  return pickUserIdByName(users, n);
}

/**
 * מסנכרן את שיוך הלקוח למנהלים:
 * - מוסיף את clientId ל-assignedClientIds של העובדים הנבחרים בטופס
 * - מסיר את clientId מרשימות של עובדים אחרים שהיו משויכים ללקוח הזה קודם
 * - מאכלס את campaignManagerId/accountManagerId של הלקוח מתוך השמות (כדי שהבוט והסקופינג יעבדו)
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

  // אכלוס מזהי המנהלים על הלקוח לפי השמות
  const campaignManagerId = pickUserIdByName(allUsers, campaignManagerName);
  const accountManagerId = pickUserIdByName(allUsers, accountManagerName);
  await prisma.client.update({ where: { id: clientId }, data: { campaignManagerId, accountManagerId } });

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
