import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "אימייל", type: "email" },
        password: { label: "סיסמה", type: "password" },
      },
      async authorize(credentials) {
        console.log("[Auth] authorize called with email:", credentials?.email);

        if (!credentials?.email || !credentials?.password) {
          console.log("[Auth] Missing email or password");
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        console.log("[Auth] User found:", !!user, user ? { id: user.id, name: user.name, role: user.role, isActive: user.isActive, hasPassword: !!user.password } : "null");

        if (!user || !user.isActive || !user.password) {
          console.log("[Auth] Rejected: user missing, inactive, or no password");
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        console.log("[Auth] Password valid:", isValid);

        if (!isValid) {
          console.log("[Auth] Rejected: wrong password");
          return null;
        }

        console.log("[Auth] Success! Returning user:", user.id, user.name, user.role);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Google OAuth — בדיקה שהמשתמש קיים ב-DB
      if (account?.provider === "google") {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });
        // אם לא קיים — דוחה התחברות
        if (!dbUser || !dbUser.isActive) return false;
        return true;
      }
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      // עדכון session — קריאה מפורשת מ-updateSession
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
      }

      // התחברות ראשונה עם credentials
      if (user && !account?.provider) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }

      // התחברות עם Google — שלוף פרטים מה-DB
      if (account?.provider === "google" && user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, role: true, name: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
        }
      }

      // אם ה-token לא מכיל role — שלוף מה-DB
      if (!token.role && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        if (dbUser) token.role = dbUser.role;
      }

      // fallback: שלוף לפי email
      if (!token.role && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }

      // שלוף assignedClientIds פעם אחת (לאכיפת הרשאות API ב-middleware)
      if (token.id && token.assignedClientIds === undefined) {
        const u = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { assignedClientIds: true },
        });
        try {
          token.assignedClientIds = u ? JSON.parse(u.assignedClientIds || "[]") : [];
        } catch {
          token.assignedClientIds = [];
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string; role: string }).id = token.id as string;
        (session.user as { id: string; role: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
