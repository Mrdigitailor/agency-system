import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { fetchPixelEvents } from "@/lib/api/meta/pixels";

interface EventOption {
  id: string;
  name: string;
  category: "pixel_events" | "lead_forms" | "other";
}

function friendlyPixelEvent(eventName: string): string {
  const map: Record<string, string> = {
    PageView: "צפייה בדף",
    ViewContent: "צפייה בתוכן",
    AddToCart: "הוספה לעגלה",
    InitiateCheckout: "תחילת תשלום",
    Purchase: "רכישה",
    Lead: "ליד",
    CompleteRegistration: "השלמת הרשמה",
    Contact: "יצירת קשר",
    Schedule: "תיאום פגישה",
    Search: "חיפוש",
    Subscribe: "הרשמה",
    SubmitApplication: "הגשת בקשה",
    StartTrial: "התחלת ניסיון",
    FindLocation: "מציאת מיקום",
    AddPaymentInfo: "הוספת אמצעי תשלום",
  };
  return map[eventName] ?? eventName;
}

function eventToActionType(eventName: string): string {
  // Meta action_type format
  const standardEvents = [
    "PageView", "ViewContent", "AddToCart", "InitiateCheckout",
    "Purchase", "Lead", "CompleteRegistration", "Contact",
    "Schedule", "Search", "Subscribe", "SubmitApplication", "StartTrial",
    "FindLocation", "AddPaymentInfo",
  ];
  if (standardEvents.includes(eventName)) {
    const lower = eventName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    return `offsite_conversion.fb_pixel_${lower}`;
  }
  // Custom event
  return `offsite_conversion.fb_pixel_custom.${eventName}`;
}

/**
 * GET /api/platforms/meta/conversion-events/[clientId]
 * שליפת אירועי המרה מהפיקסל שנבחר ללקוח + טפסי לידים
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: {
      assets: { where: { isSelected: true, assetType: { in: ["pixel", "ad_account"] } } },
    },
  });

  if (!connection) return NextResponse.json({ events: [], error: "אין חיבור Meta פעיל" });

  const pixelAsset = connection.assets.find((a) => a.assetType === "pixel");
  const events: EventOption[] = [];

  // 1. אירועים מהפיקסל שנבחר
  if (pixelAsset) {
    const pixelStats = await fetchPixelEvents(pixelAsset.externalId, connection.accessToken);
    const pixelName = pixelAsset.name;

    for (const stat of pixelStats) {
      if (stat.event === "PageView" || stat.count === 0) continue; // דלג על PageView
      const actionType = eventToActionType(stat.event);
      events.push({
        id: actionType,
        name: `${friendlyPixelEvent(stat.event)} (${stat.event})`,
        category: "pixel_events",
      });
    }

    // אם הפיקסל לא החזיר אירועים — הוסף defaults
    if (events.length === 0) {
      events.push(
        { id: "offsite_conversion.fb_pixel_lead", name: "ליד — פיקסל (Lead)", category: "pixel_events" },
        { id: "offsite_conversion.fb_pixel_purchase", name: "רכישה — פיקסל (Purchase)", category: "pixel_events" },
        { id: "offsite_conversion.fb_pixel_complete_registration", name: "השלמת הרשמה (CompleteRegistration)", category: "pixel_events" },
      );
    }
  } else {
    // אין פיקסל נבחר — הוסף defaults
    events.push(
      { id: "offsite_conversion.fb_pixel_lead", name: "ליד — פיקסל (Lead)", category: "pixel_events" },
      { id: "offsite_conversion.fb_pixel_purchase", name: "רכישה — פיקסל (Purchase)", category: "pixel_events" },
    );
  }

  // 2. טפסי לידים מטא — תמיד זמינים
  events.push(
    { id: "onsite_conversion.lead_grouped", name: "ליד — טופס מטא (lead_grouped)", category: "lead_forms" },
    { id: "onsite_conversion.leadgen_grouped", name: "Instant Form — הרשמה (leadgen_grouped)", category: "lead_forms" },
  );

  return NextResponse.json({
    events,
    pixelName: pixelAsset?.name ?? null,
    pixelId: pixelAsset?.externalId ?? null,
  });
}
