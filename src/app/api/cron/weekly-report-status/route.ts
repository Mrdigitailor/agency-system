import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Resend } from "resend";
import { getLastWeekRange, formatWeekRange } from "@/lib/utils/dates";
import { getCampaignManagerForClient } from "@/lib/utils/resolveManagers";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { start: ws, end: we } = getLastWeekRange();
  const weekEndStr = we.toISOString().split("T")[0];
  const periodStr = formatWeekRange(ws, we);

  const clients = await prisma.client.findMany({
    where: { status: { not: "inactive" }, deletedAt: null },
    select: { id: true, name: true },
  });

  const trackers = await prisma.reportTracker.findMany();
  const trackerMap = new Map(trackers.map((t) => [t.clientId, t]));

  const employees = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, assignedClientIds: true },
  });

  const sent: string[] = [];
  const missing: Array<{ name: string; cm: string }> = [];

  for (const client of clients) {
    const tracker = trackerMap.get(client.id);
    // "נשלח" = weeklyLastSent > end (סומן אחרי שהשבוע הסתיים)
    const isSent = (tracker?.weeklyLastSent ?? "") > weekEndStr;
    if (isSent) {
      sent.push(client.name);
    } else {
      const cm = getCampaignManagerForClient(client.id, employees.map((e) => ({
        ...e, email: "", phone: "", assignedClientIds: JSON.parse(e.assignedClientIds ?? "[]"),
      })));
      missing.push({ name: client.name, cm: cm ?? "—" });
    }
  }

  // Send email
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const resend = new Resend(apiKey);
    const today = new Date().toLocaleDateString("he-IL");

    const missingRows = missing.map((m) =>
      `<tr><td style="padding:8px;border-bottom:1px solid #e0e0e0;">${m.name}</td><td style="padding:8px;border-bottom:1px solid #e0e0e0;">${m.cm}</td></tr>`
    ).join("");

    await resend.emails.send({
      from: "Mr.digitailor <noreply@mr-digitailor.co.il>",
      to: "saar@digitailors.co.il",
      subject: `סטטוס דוחות שבועיים — ${today}`,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#000;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
            <h2 style="color:#eed89b;margin:0;">סטטוס דוחות שבועיים</h2>
          </div>
          <div style="padding:20px;background:#fff;border:1px solid #e0e0e0;border-top:none;">
            <p style="color:#666;margin:0 0 16px;">תקופה: <strong>${periodStr}</strong></p>
            <div style="display:flex;gap:16px;margin-bottom:20px;">
              <div style="flex:1;background:#f5f5f5;padding:12px;border-radius:8px;text-align:center;">
                <div style="font-size:24px;font-weight:bold;">${clients.length}</div>
                <div style="font-size:12px;color:#666;">לקוחות פעילים</div>
              </div>
              <div style="flex:1;background:#dcfce7;padding:12px;border-radius:8px;text-align:center;">
                <div style="font-size:24px;font-weight:bold;color:#16a34a;">${sent.length}</div>
                <div style="font-size:12px;color:#666;">נשלחו</div>
              </div>
              <div style="flex:1;background:#fef2f2;padding:12px;border-radius:8px;text-align:center;">
                <div style="font-size:24px;font-weight:bold;color:#dc2626;">${missing.length}</div>
                <div style="font-size:12px;color:#666;">חסרים</div>
              </div>
            </div>
            ${missing.length > 0 ? `
              <h3 style="margin:0 0 8px;color:#dc2626;">דוחות חסרים:</h3>
              <table style="width:100%;border-collapse:collapse;">
                <tr style="background:#f5f5f5;"><th style="padding:8px;text-align:right;">לקוח</th><th style="padding:8px;text-align:right;">מנהל קמפיינים</th></tr>
                ${missingRows}
              </table>
            ` : '<p style="color:#16a34a;">כל הדוחות נשלחו! 🎉</p>'}
          </div>
          <div style="background:#000;padding:12px;text-align:center;border-radius:0 0 8px 8px;">
            <p style="color:#eed89b;margin:0;font-size:11px;">Mr.digitailor Agency System</p>
          </div>
        </div>`,
    });
  }

  return NextResponse.json({ ok: true, total: clients.length, sent: sent.length, missing: missing.length });
}

export const dynamic = "force-dynamic";
