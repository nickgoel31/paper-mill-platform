import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/browser";

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthRoute = nextUrl.pathname === "/login";
      const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
      const isAiAgentRoute = nextUrl.pathname.startsWith("/api/ai-agent");
      const isPublicAsset = nextUrl.pathname.startsWith("/_next") || 
                            nextUrl.pathname.startsWith("/favicon.ico") ||
                            nextUrl.pathname.startsWith("/static");

      if (isApiAuthRoute || isAiAgentRoute || isPublicAsset) {
        return true;
      }

      if (isAuthRoute) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      // Protect all dashboard routes
      if (!isLoggedIn) {
        return false;
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as Role;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
