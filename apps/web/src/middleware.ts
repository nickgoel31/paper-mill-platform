import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { VIEW_AS_COOKIE, verifyViewAsCookie } from "@/lib/view-as";

const { auth } = NextAuth(authConfig);

/**
 * Single choke point for:
 *  - authentication gate (redirect anonymous users to /login)
 *  - platform vs mill routing (@twjlabs.com staff -> /platform, mill users -> /)
 *  - injecting the request-scoped tenant headers the Prisma isolation layer reads
 *    (`x-tenant-id`, `x-user-id`, `x-is-platform`)
 */
export default auth(async (req) => {
  const { nextUrl } = req;
  const p = nextUrl.pathname;
  const session = req.auth;

  const isPublic =
    p.startsWith("/api/auth") ||
    p.startsWith("/api/ai-agent") ||
    p.startsWith("/api/cron") ||
    p === "/api/health" ||
    p.startsWith("/_next") ||
    p === "/favicon.ico" ||
    p.startsWith("/static") ||
    p.startsWith("/images") ||
    p === "/manifest.json";
  const user = session?.user as
    | { id?: string; isPlatform?: boolean; tenantId?: string | null }
    | undefined;

  if (isPublic) {
    // The AI agent route stays public (it answers 401 itself), but for a logged-in
    // mill user still attach the tenant headers so the isolation layer has a scope
    // even if the route's AsyncLocalStorage context is lost mid-request.
    if (p.startsWith("/api/ai-agent") && user && user.isPlatform !== true && user.tenantId) {
      const h = new Headers(req.headers);
      h.set("x-user-id", String(user.id ?? ""));
      h.set("x-is-platform", "0");
      h.set("x-tenant-id", user.tenantId);
      return NextResponse.next({ request: { headers: h } });
    }
    return NextResponse.next();
  }
  const loggedIn = !!user;

  if (p === "/login") {
    if (loggedIn) {
      return NextResponse.redirect(new URL(user!.isPlatform ? "/platform" : "/", nextUrl));
    }
    return NextResponse.next();
  }

  if (!loggedIn) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", p);
    return NextResponse.redirect(url);
  }

  const isPlatform = user!.isPlatform === true;
  let tenantId = user!.tenantId ?? null;
  const onPlatform = p === "/platform" || p.startsWith("/platform/");

  // Platform staff can step into a mill ("view as mill"). The mill comes from a
  // signed cookie bound to this user; on mill routes the request then runs as a
  // normal mill-scoped request, on /platform routes it stays platform-scoped.
  let viewingMill = false;
  if (isPlatform && !onPlatform) {
    const viewTenant = await verifyViewAsCookie(
      req.cookies.get(VIEW_AS_COOKIE)?.value,
      String(user!.id ?? "")
    );
    if (viewTenant) {
      tenantId = viewTenant;
      viewingMill = true;
    }
  }

  if (isPlatform && !onPlatform && !viewingMill && !p.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/platform", nextUrl));
  }
  if (!isPlatform && onPlatform) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  const headers = new Headers(req.headers);
  headers.set("x-user-id", String(user!.id ?? ""));
  headers.set("x-is-platform", isPlatform && !viewingMill ? "1" : "0");
  if (tenantId) headers.set("x-tenant-id", tenantId);
  else headers.delete("x-tenant-id");

  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|images|manifest.json).*)",
  ],
};
