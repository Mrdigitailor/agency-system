import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
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
  const body = await req.json();
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
      status: body.status ?? "new",
      value: body.value ?? 0,
      notes: body.notes ?? "",
      nextFollowUp: body.nextFollowUp ?? "",
      hasProposal: body.hasProposal ?? false,
      proposalDate: body.proposalDate ?? "",
      proposalFileName: body.proposalFileName ?? "",
      internalNotes: body.internalNotes ?? "",
    },
    include: { calls: true },
  });
  return NextResponse.json({ ...lead, interestedServices: JSON.parse(lead.interestedServices) }, { status: 201 });
}
