import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, type AuthUser } from "@/lib/auth/api-guard";
import { notifyNewLead, defaultNextActionForStatus } from "@/lib/crm/automations";
import { todayIL } from "@/lib/utils/ildate";

export async function GET() {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  // לקוח קצה לא רואה CRM
  if ((result as AuthUser).role === "client") return NextResponse.json([]);

  const leads = await prisma.lead.findMany({
    include: { calls: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  const parsed = leads.map((l) => ({
    ...l,
    interestedServices: JSON.parse(l.interestedServices),
  }));
  return NextResponse.json(parsed);
}

export async function POST(req: Request) {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const status = body.status ?? "new";
  // חוק הצעד-הבא: ליד חדש נולד עם צעד מתוזמן (אלא אם הוזן ידנית)
  const autoAction = !body.nextFollowUp ? defaultNextActionForStatus(status) : null;
  const lead = await prisma.lead.create({
    data: {
      name: body.name,
      email: body.email ?? "",
      phone: body.phone ?? "",
      company: body.company ?? "",
      website: body.website ?? "",
      digitalAssets: body.digitalAssets ?? "",
      estimatedBudget: body.estimatedBudget ?? "",
      salesPerson: body.salesPerson ?? "",
      interestedServices: JSON.stringify(body.interestedServices ?? []),
      source: body.source ?? "other",
      status,
      stageChangedAt: todayIL(),
      value: body.value ?? 0,
      notes: body.notes ?? "",
      nextFollowUp: body.nextFollowUp ?? autoAction?.nextFollowUp ?? "",
      nextActionType: body.nextActionType ?? autoAction?.nextActionType ?? "",
      nextActionNote: body.nextActionNote ?? autoAction?.nextActionNote ?? "",
      hasProposal: body.hasProposal ?? false,
      proposalDate: body.proposalDate ?? "",
      proposalFileName: body.proposalFileName ?? "",
      internalNotes: body.internalNotes ?? "",
    },
    include: { calls: true },
  });

  // התראת טלגרם מיידית — speed-to-lead. לא מפיל את הבקשה אם נכשל.
  notifyNewLead(lead).catch((e) => console.error("[Leads] Telegram notify failed:", e));

  return NextResponse.json({ ...lead, interestedServices: JSON.parse(lead.interestedServices) }, { status: 201 });
}
