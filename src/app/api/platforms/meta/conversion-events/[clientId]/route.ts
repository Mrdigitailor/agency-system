import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { fetchCustomConversions } from "@/lib/api/meta/conversions";
import { metaApiGet } from "@/lib/api/meta/client";

interface EventOption {
  id: string; // action_type שישמש לחיפוש ב-actionsJson
  name: string; // שם לתצוגה
  source: "custom" | "pixel" | "standard" | "insights";
}

/**
 * GET /api/platforms/meta/conversion-events/[clientId]
 * שליפה חיה של כל אירועי ההמרה הזמינים ללקוח:
 * 1. Custom conversions מ-/customconversions
 * 2. Action types ייחודיים מ-insights של 30 ימים אחרונים
 * 3. Standard events תמיד זמינים
 */
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: {
      assets: { where: { assetType: "ad_account", isSelected: true } },
    },
  });

  if (!connection) {
    return NextResponse.json({ events: [], error: "אין חיבור Meta פעיל" });
  }

  if (connection.assets.length === 0) {
    return NextResponse.json({ events: [], error: "לא נבחרו חשבונות מודעות" });
  }

  const accessToken = connection.accessToken;
  const eventsMap = new Map<string, EventOption>();

  // Standard events תמיד זמינים
  const standardEvents: Array<{ id: string; name: string }> = [
    { id: "lead", name: "Lead (Standard)" },
    { id: "purchase", name: "Purchase (Standard)" },
    { id: "complete_registration", name: "Complete Registration" },
    { id: "add_to_cart", name: "Add to Cart" },
    { id: "initiate_checkout", name: "Initiate Checkout" },
    { id: "subscribe", name: "Subscribe" },
    { id: "contact", name: "Contact" },
    { id: "schedule", name: "Schedule" },
    { id: "start_trial", name: "Start Trial" },
    { id: "submit_application", name: "Submit Application" },
    { id: "view_content", name: "View Content" },
    { id: "search", name: "Search" },
  ];
  for (const e of standardEvents) {
    eventsMap.set(e.id, { ...e, source: "standard" });
  }

  // שליפה מכל חשבון מודעות שנבחר
  for (const adAccount of connection.assets) {
    // 1. Custom conversions
    try {
      const customConvs = await fetchCustomConversions(adAccount.externalId, accessToken);
      for (const cc of customConvs) {
        const actionType = `offsite_conversion.custom.${cc.id}`;
        eventsMap.set(actionType, {
          id: actionType,
          name: `${cc.name} (Custom)`,
          source: "custom",
        });
      }
    } catch (err) {
      console.warn(`[conversion-events] custom conversions failed for ${adAccount.externalId}:`, err);
    }

    // 2. Action types מ-insights של 30 ימים אחרונים
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];
      const insights = await metaApiGet<{ data: Array<{ actions?: Array<{ action_type: string }> }> }>(
        `/${adAccount.externalId}/insights`,
        {
          accessToken,
          params: {
            fields: "actions",
            time_range: JSON.stringify({ since, until: today }),
            level: "account",
          },
          retries: 1,
        }
      );

      for (const row of insights.data) {
        if (!row.actions) continue;
        for (const action of row.actions) {
          const type = action.action_type;
          if (!eventsMap.has(type)) {
            // זיהוי סוג
            let name = type;
            let source: EventOption["source"] = "insights";
            if (type.startsWith("offsite_conversion.fb_pixel_")) {
              const evt = type.replace("offsite_conversion.fb_pixel_", "");
              name = `${evt} (Pixel)`;
              source = "pixel";
            } else if (type.startsWith("onsite_conversion.")) {
              name = type.replace("onsite_conversion.", "").replace(/_/g, " ") + " (On-Site)";
            }
            eventsMap.set(type, { id: type, name, source });
          }
        }
      }
    } catch (err) {
      console.warn(`[conversion-events] insights failed for ${adAccount.externalId}:`, err);
    }
  }

  // מיון: custom/pixel קודם, אחר כך standard/insights
  const events = Array.from(eventsMap.values()).sort((a, b) => {
    const order = { custom: 0, pixel: 1, standard: 2, insights: 3 };
    if (order[a.source] !== order[b.source]) return order[a.source] - order[b.source];
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ events });
}
