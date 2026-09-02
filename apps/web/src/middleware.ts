import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Protect all dashboard and api routes except auth endpoints, static assets, and images
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|images|manifest.json).*)",
  ],
};
