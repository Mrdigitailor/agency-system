import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

function getHomeForRole(role: string): string {
  switch (role) {
    case "client": return "/client-portal";
    default: return "/dashboard";
  }
}

const roleAccess: Record<string, string[]> = {
  "/dashboard": ["admin", "manager", "campaignManager"],
  "/clients": ["admin", "manager", "campaignManager"],
  "/tasks": ["admin", "manager", "campaignManager"],
  "/calendar": ["admin", "manager", "campaignManager"],
  "/chat": ["admin", "manager", "campaignManager"],
  "/crm": ["admin"],
  "/finance": ["admin"],
  "/recruitment": ["admin"],
  "/suppliers": ["admin", "manager"],
  "/reports": ["admin", "manager", "campaignManager"],
  "/settings": ["admin"],
  "/profile": ["admin", "manager", "campaignManager"],
  "/client-portal": ["client"],
};

// נתיבי API שאסורים לחלוטין ללקוח קצה (מידע פנימי של הסוכנות)
const CLIENT_API_DENY = ["/api/crm", "/api/leads", "/api/finance", "/api/recruitment", "/api/suppliers", "/api/employees", "/api/competitors"];

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const role = (token?.role as string) ?? "";

    // ===== אכיפת הרשאות API (מחזיר JSON) =====
    if (pathname.startsWith("/api/")) {
      // בקשות עם Bearer (cron/אינטגרציות) — מועברות ל-route שמאמת את הסוד בעצמו
      const hasBearer = !!req.headers.get("authorization");
      if (!token && !hasBearer) return NextResponse.json({ error: "לא מורשה" }, { status: 401 });

      if (role === "client") {
        if (CLIENT_API_DENY.some((d) => pathname.startsWith(d))) {
          return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
        }
        // IDOR — לקוח רשאי לגשת רק ללקוח/ות שלו תחת /api/clients/<id>/...
        if (pathname.startsWith("/api/clients/")) {
          const clientId = pathname.split("/")[3];
          const assigned = (token?.assignedClientIds as string[] | undefined) ?? [];
          if (clientId && !assigned.includes(clientId)) {
            return NextResponse.json({ error: "אין הרשאה ללקוח זה" }, { status: 403 });
          }
        }
      }
      return NextResponse.next();
    }

    // ===== אכיפת הרשאות דפים =====
    for (const [path, roles] of Object.entries(roleAccess)) {
      if (pathname.startsWith(path) && !roles.includes(role)) {
        const home = getHomeForRole(role);
        if (pathname.startsWith(home)) return NextResponse.next();
        return NextResponse.redirect(new URL(home, req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // /api מטופל בתוך הפונקציה (כדי להחזיר JSON ולא redirect); דפים דורשים token
      authorized: ({ req, token }) => (req.nextUrl.pathname.startsWith("/api/") ? true : !!token),
    },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/clients/:path*",
    "/tasks/:path*",
    "/calendar/:path*",
    "/chat/:path*",
    "/crm/:path*",
    "/finance/:path*",
    "/recruitment/:path*",
    "/suppliers/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/client-portal/:path*",
    // אכיפת API — נתיבים רגישים בלבד (לא כולל ציבוריים: /api/public, /api/cron, /api/telegram, /api/auth)
    "/api/clients/:path*",
    "/api/crm/:path*",
    "/api/leads/:path*",
    "/api/finance/:path*",
    "/api/recruitment/:path*",
    "/api/suppliers/:path*",
    "/api/employees/:path*",
    "/api/competitors/:path*",
  ],
};
