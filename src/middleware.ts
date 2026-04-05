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
  "/reports": ["admin", "manager", "campaignManager"],
  "/settings": ["admin"],
  "/profile": ["admin", "manager", "campaignManager"],
  "/client-portal": ["client"],
};

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = (req.nextauth.token?.role as string) ?? "";

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
    callbacks: { authorized: ({ token }) => !!token },
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/clients/:path*",
    "/tasks/:path*",
    "/calendar/:path*",
    "/chat/:path*",
    "/crm/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/client-portal/:path*",
  ],
};
