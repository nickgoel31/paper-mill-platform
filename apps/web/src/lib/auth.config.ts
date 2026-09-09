import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/browser";
import { isPlatformEmail } from "@/lib/platform";

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Route protection + tenant/platform routing + request-scoped headers are all
    // handled in `middleware.ts` (it needs `NextResponse.next({ request })` to
    // inject headers, which `authorized` cannot return).
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.email = user.email;
        token.name = user.name;
        token.tenantId = (user as any).tenantId ?? null;
        token.isPlatform = isPlatformEmail(user.email);
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as Role;
        (session.user as any).tenantId = (token.tenantId as string | null) ?? null;
        (session.user as any).isPlatform = !!token.isPlatform;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
