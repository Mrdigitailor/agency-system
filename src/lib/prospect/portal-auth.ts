// כניסה לפורטל הלקוח — קישור ייחודי + סיסמה.
// הקישור הוא ההזמנה: בביקור הראשון בעל הפורטל קובע סיסמה, ומאז היא נדרשת בכל כניסה.
// הסשן נשמר בעוגייה חתומה (HMAC) לכל פורטל בנפרד. "demo" פתוח בלי סיסמה.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { FunnelPortal } from "@/generated/prisma";

const SESSION_DAYS = 30;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
export const MIN_PASSWORD = 8;

export type PortalAccess =
  | { ok: true; demo: true; portal: null }
  | { ok: true; demo: false; portal: FunnelPortal }
  | { ok: false; response: NextResponse };

const secret = () => process.env.NEXTAUTH_SECRET ?? "";
const cookieName = (portalId: string) => `mrd_portal_${portalId}`;

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function sessionValue(portalId: string): string {
  const exp = Date.now() + SESSION_DAYS * 24 * 3600_000;
  const payload = `${portalId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function sessionValid(portalId: string, value: string | undefined): boolean {
  if (!value || !secret()) return false;
  const [id, exp, sig] = value.split(".");
  if (id !== portalId || !exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = sign(`${id}.${exp}`);
  try { return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
  catch { return false; }
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function attachSession(res: NextResponse, portalId: string): NextResponse {
  res.cookies.set(cookieName(portalId), sessionValue(portalId), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: SESSION_DAYS * 24 * 3600,
  });
  return res;
}

export function clearSession(res: NextResponse, portalId: string): NextResponse {
  res.cookies.set(cookieName(portalId), "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function findPortal(token: string): Promise<FunnelPortal | null> {
  if (!/^[a-z0-9-]{16,40}$/i.test(token)) return null;
  const portal = await prisma.funnelPortal.findUnique({ where: { token } });
  return portal && !portal.deletedAt ? portal : null;
}

/** מצב הכניסה של הדפדפן הזה לפורטל: demo | needSetup | needPassword | ok */
export async function portalState(req: Request, token: string): Promise<{ state: "notFound" | "demo" | "needSetup" | "needPassword" | "ok"; portal: FunnelPortal | null }> {
  if (token === "demo") return { state: "demo", portal: null };
  const portal = await findPortal(token);
  if (!portal) return { state: "notFound", portal: null };
  if (!portal.passwordHash) return { state: "needSetup", portal };
  if (!sessionValid(portal.id, readCookie(req, cookieName(portal.id)))) return { state: "needPassword", portal };
  return { state: "ok", portal };
}

/** שער לכל קריאות ה-API של הפורטל: מחזיר את הפורטל, או תשובת שגיאה מוכנה */
export async function requirePortal(req: Request, token: string): Promise<PortalAccess> {
  const { state, portal } = await portalState(req, token);
  if (state === "demo") return { ok: true, demo: true, portal: null };
  if (state === "ok" && portal) return { ok: true, demo: false, portal };
  if (state === "notFound") return { ok: false, response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  return { ok: false, response: NextResponse.json({ error: "נדרשת כניסה", auth: state }, { status: 401 }) };
}

export async function setInitialPassword(portal: FunnelPortal, password: string): Promise<boolean> {
  // רק פורטל בלי סיסמה — התנאי בתוך העדכון עצמו, שלא ידרסו סיסמה קיימת במרוץ
  const hash = await bcrypt.hash(password, 10);
  const res = await prisma.funnelPortal.updateMany({ where: { id: portal.id, passwordHash: "" }, data: { passwordHash: hash } });
  return res.count === 1;
}

/** בדיקת סיסמה עם נעילה אחרי כמה ניסיונות כושלים */
export async function checkPassword(portal: FunnelPortal, password: string): Promise<{ ok: boolean; locked?: boolean }> {
  if (portal.lockedUntil && portal.lockedUntil > new Date()) return { ok: false, locked: true };
  const ok = await bcrypt.compare(password, portal.passwordHash);
  if (ok) {
    if (portal.failedLogins > 0 || portal.lockedUntil) {
      await prisma.funnelPortal.update({ where: { id: portal.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    return { ok: true };
  }
  const failed = portal.failedLogins + 1;
  const lock = failed >= MAX_FAILED;
  await prisma.funnelPortal.update({
    where: { id: portal.id },
    data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
  });
  return { ok: false, locked: lock };
}

export async function changePassword(portal: FunnelPortal, newPassword: string): Promise<void> {
  await prisma.funnelPortal.update({ where: { id: portal.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
}
