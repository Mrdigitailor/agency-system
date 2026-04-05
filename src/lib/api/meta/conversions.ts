// שליפת custom conversions + standard events מ-Meta

import { metaApiGetAll } from "./client";

export interface MetaCustomConversion {
  id: string;
  name: string;
  description?: string;
  custom_event_type?: string;
  rule?: string;
}

// Standard event types של Meta (FB Pixel)
export const META_STANDARD_EVENTS = [
  { actionType: "purchase", label: "Purchase (רכישה)" },
  { actionType: "lead", label: "Lead (ליד)" },
  { actionType: "complete_registration", label: "Complete Registration (הרשמה)" },
  { actionType: "add_to_cart", label: "Add to Cart (הוספה לעגלה)" },
  { actionType: "initiate_checkout", label: "Initiate Checkout (תחילת checkout)" },
  { actionType: "subscribe", label: "Subscribe (הרשמה לניוזלטר)" },
  { actionType: "contact", label: "Contact (יצירת קשר)" },
  { actionType: "find_location", label: "Find Location (מציאת מיקום)" },
  { actionType: "schedule", label: "Schedule (תיאום פגישה)" },
  { actionType: "start_trial", label: "Start Trial (התחלת ניסיון)" },
  { actionType: "submit_application", label: "Submit Application (הגשת בקשה)" },
  { actionType: "view_content", label: "View Content (צפייה בתוכן)" },
  { actionType: "search", label: "Search (חיפוש)" },
] as const;

/**
 * שליפת custom conversions של חשבון מודעות
 */
export async function fetchCustomConversions(
  adAccountId: string,
  accessToken: string
): Promise<MetaCustomConversion[]> {
  try {
    return await metaApiGetAll<MetaCustomConversion>(`/${adAccountId}/customconversions`, {
      accessToken,
      params: { fields: "id,name,description,custom_event_type,rule", limit: "100" },
    });
  } catch (err) {
    console.warn(`[Meta] failed to fetch custom conversions for ${adAccountId}:`, err);
    return [];
  }
}
