// נקודת הכניסה של סוכן הגוגל אדס מערכת השכפול. מאומתת במפתח הערכה (KIT_API_KEY), לא בכניסת משתמש.
// פעולות: research (מחקר מילות חיפוש), search (קריאת נתונים), mutate (שינוי, עם מעקות בטיחות).
import { NextResponse } from "next/server";
import { gadsMutate, gadsSearch, isAllowedAccount } from "@/lib/kit/google-ads";
import { runResearch } from "@/lib/prospect/research";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const key = process.env.KIT_API_KEY;
  if (!key) return fail("הערכה לא הוגדרה בשרת הזה", 503);
  if (req.headers.get("authorization") !== `Bearer ${key}`) return fail("unauthorized", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("bad request"); }
  const op = String(body.op ?? "");

  try {
    if (op === "research") {
      const field = String(body.serviceField ?? "").trim();
      if (!field) return fail("חסר serviceField");
      return NextResponse.json({ ok: true, result: await runResearch(field, String(body.serviceArea ?? "")) });
    }

    const customerId = String(body.customerId ?? "");
    if (!/^[\d-]{10,12}$/.test(customerId)) return fail("חסר customerId");
    if (!(await isAllowedAccount(customerId))) return fail("החשבון הזה לא שייך למשפך", 403);

    if (op === "search") {
      const query = String(body.query ?? "");
      if (!/^\s*select\s/i.test(query)) return fail("חסרה שאילתה");
      return NextResponse.json({ ok: true, result: await gadsSearch(customerId, query) });
    }
    if (op === "mutate") {
      const operations = Array.isArray(body.operations) ? (body.operations as Record<string, unknown>[]) : [];
      if (!operations.length || operations.length > 200) return fail("operations חייב להכיל 1 עד 200 פעולות");
      return NextResponse.json({ ok: true, result: await gadsMutate(customerId, String(body.service ?? ""), operations, body.validateOnly === true) });
    }
    return fail("op לא מוכר");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "שגיאה", 422);
  }
}
