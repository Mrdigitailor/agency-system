import type { Employee } from "@/lib/data/types";

/**
 * מוצא את מנהל הקמפיינים של לקוח — העובד עם role=campaignManager
 * שהלקוח נמצא ב-assignedClientIds שלו
 */
export function getCampaignManagerForClient(
  clientId: string,
  employees: Employee[]
): string {
  const emp = employees.find(
    (e) =>
      e.role === "campaignManager" &&
      e.assignedClientIds.includes(clientId)
  );
  return emp?.name ?? "";
}

/**
 * מוצא את מנהל התיקים / סמנכ״ל של לקוח — העובד עם role=manager
 * שהלקוח נמצא ב-assignedClientIds שלו
 */
export function getAccountManagerForClient(
  clientId: string,
  employees: Employee[]
): string {
  const emp = employees.find(
    (e) =>
      e.role === "manager" &&
      e.assignedClientIds.includes(clientId)
  );
  return emp?.name ?? "";
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
