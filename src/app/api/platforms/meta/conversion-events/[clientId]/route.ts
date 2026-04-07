import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/api-guard";
import { fetchCustomConversions } from "@/lib/api/meta/conversions";
import { metaApiGet } from "@/lib/api/meta/client";

interface EventOption {
  id: string;
  name: string;
  category: "leads" | "purchases" | "custom" | "engagement" | "other";
}

function categorizeEvent(actionType: string): EventOption["category"] {
  if (actionType.includes("lead")) return "leads";
  if (actionType.includes("purchase")) return "purchases";
  if (actionType.includes("engagement") || actionType.includes("post_engagement") || actionType.includes("page_engagement")) return "engagement";
  if (actionType.startsWith("offsite_conversion.custom")) return "custom";
  return "other";
}

function friendlyName(actionType: string): string {
  // לידים
  if (actionType === "onsite_conversion.lead_grouped") return "ליד — טופס ליד מטא";
  if (actionType === "offsite_conversion.fb_pixel_lead") return "ליד — פיקסל באתר";
  if (actionType === "lead") return "ליד — Standard";
  // רכישות
  if (actionType === "offsite_conversion.fb_pixel_purchase") return "רכישה — פיקסל באתר";
  if (actionType === "purchase") return "רכישה — Standard";
  // אחר מוכרים
  if (actionType === "landing_page_view") return "צפייה בדף נחיתה";
  if (actionType === "link_click") return "קליק על קישור";
  if (actionType === "post_engagement") return "מעורבות פוסט";
  if (actionType === "page_engagement") return "מעורבות עמוד";
  if (actionType === "video_view") return "צפייה בוידאו";
  if (actionType === "complete_registration") return "השלמת הרשמה";
  if (actionType === "add_to_cart") return "הוספה לעגלה";
  if (actionType === "initiate_checkout") return "תחילת תשלום";
  if (actionType === "subscribe") return "הרשמה";
  if (actionType === "contact") return "יצירת קשר";
  if (actionType === "schedule") return "תיאום פגישה";
  if (actionType === "view_content") return "צפייה בתוכן";
  if (actionType === "search") return "חיפוש";
  // offsite_conversion prefix
  if (actionType.startsWith("offsite_conversion.fb_pixel_")) {
    const evt = actionType.replace("offsite_conversion.fb_pixel_", "");
    return `${evt} — פיקסל`;
  }
  if (actionType.startsWith("onsite_conversion.")) {
    return actionType.replace("onsite_conversion.", "").replace(/_/g, " ");
  }
  return actionType;
}

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const { clientId } = await params;

  const connection = await prisma.platformConnection.findFirst({
    where: { clientId, platform: "meta", isActive: true },
    include: { assets: { where: { assetType: "ad_account", isSelected: true } } },
  });

  if (!connection) return NextResponse.json({ events: [], error: "אין חיבור Meta פעיל" });
  if (connection.assets.length === 0) return NextResponse.json({ events: [], error: "לא נבחרו חשבונות מודעות" });

  const accessToken = connection.accessToken;
  const eventsMap = new Map<string, EventOption>();

  for (const adAccount of connection.assets) {
    // 1. Custom conversions
    try {
      const customConvs = await fetchCustomConversions(adAccount.externalId, accessToken);
      for (const cc of customConvs) {
        const actionType = `offsite_conversion.custom.${cc.id}`;
        eventsMap.set(actionType, {
          id: actionType,
          name: `${cc.name}`,
          category: "custom",
        });
      }
    } catch (err) {
      console.warn("[conversion-events] custom conversions failed:", err);
    }

    // 2. Action types מ-insights
    try {
      const insights = await metaApiGet<{ data: Array<{ actions?: Array<{ action_type: string; value: string }> }> }>(
        `/${adAccount.externalId}/insights`,
        {
          accessToken,
          params: {
            fields: "actions",
            time_range: JSON.stringify({
              since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              until: new Date().toISOString().split("T")[0],
            }),
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
            eventsMap.set(type, {
              id: type,
              name: friendlyName(type),
              category: categorizeEvent(type),
            });
          }
        }
      }
    } catch (err) {
      console.warn("[conversion-events] insights failed:", err);
    }
  }

  // מיון לפי קטגוריה
  const categoryOrder: Record<string, number> = { leads: 0, purchases: 1, custom: 2, engagement: 3, other: 4 };
  const events = Array.from(eventsMap.values()).sort((a, b) => {
    if (categoryOrder[a.category] !== categoryOrder[b.category]) return categoryOrder[a.category] - categoryOrder[b.category];
    return a.name.localeCompare(b.name, "he");
  });

  return NextResponse.json({ events });
}
