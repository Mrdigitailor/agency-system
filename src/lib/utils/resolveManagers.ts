import type { Employee } from "@/lib/data/types";

/**
 * מוצא את מנהל הקמפיינים של לקוח.
 * מקור אמת ראשון: השם השמור על רשומת הלקוח (storedName) — תומך בכל תפקיד, כולל בעלים.
 * גיבוי לרשומות ישנות: העובד שהלקוח ב-assignedClientIds שלו (מנהל קמפיינים, ואז בעלים).
 */
export function getCampaignManagerForClient(
  clientId: string,
  employees: Employee[],
  storedName?: string
): string {
  if (storedName?.trim()) return storedName.trim();
  const cm = employees.find(
    (e) => e.role === "campaignManager" && e.assignedClientIds.includes(clientId)
  );
  if (cm) return cm.name;
  const admin = employees.find(
    (e) => e.role === "admin" && e.assignedClientIds.includes(clientId)
  );
  return admin?.name ?? "";
}

/**
 * מוצא את מנהל התיקים / סמנכ״ל של לקוח.
 * מקור אמת ראשון: השם השמור על רשומת הלקוח; גיבוי: עובד עם role=manager שמשויך ללקוח.
 */
export function getAccountManagerForClient(
  clientId: string,
  employees: Employee[],
  storedName?: string
): string {
  if (storedName?.trim()) return storedName.trim();
  const mgr = employees.find(
    (e) => e.role === "manager" && e.assignedClientIds.includes(clientId)
  );
  return mgr?.name ?? "";
}

/**
 * מחזיר שני המנהלים של לקוח
 */
export function getManagersForClient(
  clientId: string,
  employees: Employee[]
): { campaignManager: string; accountManager: string } {
  return {
    campaignManager: getCampaignManagerForClient(clientId, employees),
    accountManager: getAccountManagerForClient(clientId, employees),
  };
}
