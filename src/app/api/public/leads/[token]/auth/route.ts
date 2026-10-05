// כניסה לפורטל הלקוח.
// GET:  מצב הכניסה של הדפדפן הזה (demo | needSetup | needPassword | ok) + שם הפורטל.
// POST: action=setup (קביעת סיסמה בביקור הראשון) | login | logout | change (החלפת סיסמה, דורש סשן).
import { NextResponse } from "next/server";
import {
  portalState, attachSession, clearSession, setInitialPassword, checkPassword, changePassword, MIN_PASSWORD,
} from "@/lib/prospect/portal-auth";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state, portal } = await portalState(req, token);
  if (state === "notFound") return bad("not found", 404);
  return NextResponse.json({ state, name: state === "demo" ? "העסק שלך" : portal?.name ?? "" });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state, portal } = await portalState(req, token);
  if (state === "notFound" || !portal) return bad("not found", 404);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("bad request"); }
  const action = typeof body.action === "string" ? body.action : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (action === "logout") return clearSession(NextResponse.json({ ok: true }), portal.id);

  if (action === "setup") {
    if (state !== "needSetup") return bad("כבר הוגדרה סיסמה לפורטל הזה", 409);
    if (password.length < MIN_PASSWORD || password.length > 200) return bad(`הסיסמה צריכה להיות באורך ${MIN_PASSWORD} תווים לפחות`);
    if (!(await setInitialPassword(portal, password))) return bad("כבר הוגדרה סיסמה לפורטל הזה", 409);
    return attachSession(NextResponse.json({ ok: true }), portal.id);
  }

  if (action === "login") {
    if (state === "needSetup") return bad("עוד לא הוגדרה סיסמה", 409);
    const res = await checkPassword(portal, password);
    if (res.locked) return bad("יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.", 429);
    if (!res.ok) return bad("סיסמה שגויה", 401);
    return attachSession(NextResponse.json({ ok: true }), portal.id);
  }

  if (action === "change") {
    if (state !== "ok") return bad("נדרשת כניסה", 401);
    const next = typeof body.newPassword === "string" ? body.newPassword : "";
    if (next.length < MIN_PASSWORD || next.length > 200) return bad(`הסיסמה החדשה צריכה להיות באורך ${MIN_PASSWORD} תווים לפחות`);
    const res = await checkPassword(portal, password);
    if (res.locked) return bad("יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.", 429);
    if (!res.ok) return bad("הסיסמה הנוכחית שגויה", 401);
    await changePassword(portal, next);
    return attachSession(NextResponse.json({ ok: true }), portal.id);
  }

  return bad("פעולה לא מוכרת");
}
