import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { fetchPixelEvents, fetchPixelCustomConversions } from "@/lib/api/meta/pixels";

interface EventOption {
  id: string;       // action_type לחישוב
  name: string;     // שם כמו שמופיע ב-Meta (באנגלית)
  eventType: string; // Standard Event / Custom Event / Custom Conversion / Lead Form
}

// אירועים סטנדרטיים מוכרים של Meta
const STANDARD_EVENTS = new Set([
  "PageView", "ViewContent", "AddToCart", "InitiateCheckout",
  "Purchase", "Lead", "CompleteRegistration", "Contact",
  "Schedule", "Search", "Subscribe", "SubmitApplication",
  "StartTrial", "FindLocation", "AddPaymentInfo",
  "AddToWishlist", "CustomizeProduct", "Donate",
]);

function eventToActionType(eventName: string): string {
  if (STANDARD_EVENTS.has(eventName)) {
    // CamelCase → snake_case
    const snake = eventName.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    return `offsite_conversion.fb_pixel_${snake}`;
  }
  // Custom events
  return `offsite_conversion.fb_pixel_custom.${eventName}`;
}

/**
 * GET /api/platforms/meta/conversion-events/[clientId]
 * שליפת אירועי המרה מהפיקסל שנבחר ללקוח
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
  const adAccountAsset = connection.assets.find((a) => a.assetType === "ad_account");
  const events: EventOption[] = [];

  // 1. אירועי הפיקסל
  if (pixelAsset) {
    console.log(`[ConvEvents] Loading events for pixel: ${pixelAsset.externalId} (${pixelAsset.name})`);

    const pixelStats = await fetchPixelEvents(pixelAsset.externalId, connection.accessToken);

    for (const stat of pixelStats) {
      const eventName = stat.event;
      if (!eventName || eventName === "undefined" || eventName === "null") continue;
      if (eventName === "Microdata") continue; // Internal Meta event

      const actionType = eventToActionType(eventName);
      const isStandard = STANDARD_EVENTS.has(eventName);

      events.push({
        id: actionType,
        name: eventName,
        eventType: isStandard ? "Standard Event" : "Custom Event",
      });
    }

    // 2. Custom conversions של הפיקסל
    if (adAccountAsset) {
      const customConvs = await fetchPixelCustomConversions(
        adAccountAsset.externalId,
        pixelAsset.externalId,
        connection.accessToken
      );

      for (const cc of customConvs) {
        if (!cc.name) continue;
        events.push({
          id: `offsite_conversion.custom.${cc.id}`,
          name: cc.name,
          eventType: "Custom Conversion",
        });
      }
    }
  }

  // 3. טפסי לידים מטא — תמיד זמינים
  events.push(
    { id: "onsite_conversion.lead_grouped", name: "Lead — Meta Lead Form", eventType: "Lead Form" },
    { id: "onsite_conversion.leadgen_grouped", name: "Instant Form", eventType: "Lead Form" },
  );

  // סינון כפילויות
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  console.log(`[ConvEvents] Returning ${unique.length} events for client ${clientId}`);

  return NextResponse.json({
    events: unique,
    pixelName: pixelAsset?.name ?? null,
    pixelId: pixelAsset?.externalId ?? null,
  });
}
