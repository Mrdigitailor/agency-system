// הפעלת אונבורדינג ללקוח: סריקת קודי מעקב באתר + יצירת חבילת משימות פתיחה.
// בטוח להרצה חוזרת — משימות שכבר קיימות (לפי כותרת) לא נוצרות שוב.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/api-guard";
import { resolveManagerId } from "@/lib/utils/syncManagers";
import { scanWebsite, type SiteScanResult } from "@/lib/onboarding/site-scan";
import { buildOnboardingTasks } from "@/lib/onboarding/checklist";
import { sendQuestionnaireEmail } from "@/lib/onboarding/questionnaire-email";
import { todayIL, shiftYmd } from "@/lib/utils/ildate";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["admin", "manager"]);
  if (result instanceof NextResponse) return result;
  const { id: clientId } = await params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, clientType: true, platforms: true, website: true,
      metaAdAccount: true, googleAdAccount: true, tiktokAdAccount: true,
      campaignManagerId: true, campaignManager: true, contactEmail: true,
    },
  });
  if (!client || !clientId) return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });

  let platforms: string[] = [];
  try { platforms = JSON.parse(client.platforms || "[]"); } catch {}

  // סריקת קודי מעקב באתר (אם יש אתר בכרטיס)
  const scan: SiteScanResult | null = client.website.trim() ? await scanWebsite(client.website) : null;

  const templates = buildOnboardingTasks({
    clientType: client.clientType,
    platforms,
    website: client.website,
    metaAdAccount: client.metaAdAccount,
    googleAdAccount: client.googleAdAccount,
    tiktokAdAccount: client.tiktokAdAccount,
  }, scan);

  // אחראים: משימות בעלים → אדמין, השאר → מנהל הקמפיינים של הלקוח (ואם אין — אדמין)
  let cmId = client.campaignManagerId;
  if (!cmId && client.campaignManager) cmId = await resolveManagerId(client.campaignManager);
  const [cm, admin] = await Promise.all([
    cmId ? prisma.user.findUnique({ where: { id: cmId }, select: { id: true, name: true } }) : Promise.resolve(null),
    prisma.user.findFirst({ where: { role: "admin", isActive: true }, select: { id: true, name: true } }),
  ]);

  // הרצה חוזרת לא מכפילה משימות
  const existing = await prisma.task.findMany({
    where: { clientId, deletedAt: null, title: { startsWith: "אונבורדינג:" } },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((t) => t.title));

  const today = todayIL();
  const created: Array<{ title: string; assignee: string; dueDate: string }> = [];
  const skipped: string[] = [];

  for (const tpl of templates) {
    if (existingTitles.has(tpl.title)) { skipped.push(tpl.title); continue; }
    const assignee = tpl.assignTo === "admin" ? admin : (cm ?? admin);
    const dueDate = shiftYmd(today, tpl.dueDays);
    await prisma.task.create({
      data: {
        title: tpl.title,
        description: tpl.description,
        clientId,
        assigneeId: assignee?.id ?? null,
        assignee: assignee?.name ?? "",
        creatorId: admin?.id ?? null,
        priority: tpl.priority,
        dueDate,
        status: "pending",
        taskType: "other",
        platform: tpl.platform,
      },
    });
    created.push({ title: tpl.title, assignee: assignee?.name ?? "—", dueDate });
  }

  // שאלון אונבורדינג: יצירת קישור אישי + שליחה במייל ללקוח (אם עוד לא מולא)
  const q = await prisma.clientQuestionnaire.upsert({ where: { clientId }, update: {}, create: { clientId } });
  const origin = process.env.APP_BASE_URL ?? new URL(_req.url).origin;
  const questionnaireLink = `${origin}/questionnaire/${q.token}`;
  let emailSent = false;
  let emailNote: string | null = null;
  if (q.status === "completed") {
    emailNote = "השאלון כבר מולא על ידי הלקוח";
  } else {
    const emailResult = await sendQuestionnaireEmail({ clientName: client.name, contactEmail: client.contactEmail, link: questionnaireLink });
    emailSent = emailResult.sent;
    emailNote = emailResult.reason ?? null;
    if (emailResult.sent) await prisma.clientQuestionnaire.update({ where: { id: q.id }, data: { sentAt: new Date() } });
  }

  console.log(`[Onboarding] client=${client.name} created=${created.length} skipped=${skipped.length} scan=${scan ? (scan.ok ? "ok" : `failed:${scan.error}`) : "no-website"} questionnaireEmail=${emailSent}`);

  return NextResponse.json({
    created, skipped, scan,
    questionnaire: { link: questionnaireLink, status: q.status, emailSent, emailNote },
  });
}
