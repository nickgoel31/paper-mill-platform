import { auth } from "@/lib/auth";
import { Role } from "@/generated/prisma/browser";
import { isPlatformEmail } from "@/lib/platform";
import { headers } from "next/headers";
import { getTenantContextSync } from "@/lib/tenant-context";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: You must be logged in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden: Insufficient permissions.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  tenantId: string | null;
  isPlatform: boolean;
  /** True when platform staff are acting inside a mill via "view as mill". */
  viewingAs?: boolean;
};

async function requireSessionUser(opts?: { ignoreViewAs?: boolean }): Promise<SessionUser> {
  const session = await auth();
  if (!session || !session.user) {
    // No browser session — fall back to an ALS-asserted system actor, set
    // only by trusted internal callers (the WhatsApp webhook, scheduled
    // jobs) via runWithTenantContext({ tenantId, userId, role }). This never
    // reads request headers or other client-controlled input, and the
    // role/tenantId used are whatever that internal caller looked up from
    // the database for a real user — no privilege beyond what that user
    // already has in the app.
    const ctx = getTenantContextSync();
    if (ctx?.userId && ctx?.role && ctx?.tenantId) {
      return {
        id: ctx.userId,
        name: null,
        email: null,
        role: ctx.role as Role,
        tenantId: ctx.tenantId,
        isPlatform: false,
      };
    }
    throw new UnauthorizedError();
  }
  const u = session.user as any;
  const user: SessionUser = {
    id: u.id as string,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    tenantId: (u.tenantId ?? null) as string | null,
    isPlatform: u.isPlatform === true || isPlatformEmail(u.email),
  };

  // "View as mill": middleware verified the signed cookie and turned this into a
  // mill-scoped request (x-is-platform: 0 + x-tenant-id). Platform staff then act
  // as that mill's admin. Client-sent copies of these headers are overwritten by
  // middleware, so they can be trusted here.
  if (user.isPlatform && !opts?.ignoreViewAs) {
    try {
      const h = await headers();
      const viewTenant = h.get("x-tenant-id");
      if (h.get("x-is-platform") === "0" && viewTenant) {
        return { ...user, role: Role.ADMIN, tenantId: viewTenant, isPlatform: false, viewingAs: true };
      }
    } catch {
      // no request context
    }
  }
  return user;
}

/**
 * Ensure the user has one of the allowed roles (within their mill). Throws if not
 * authenticated or lacks the role. Returns the user plus their `tenantId`.
 */
export async function requireRole(...allowedRoles: Role[]) {
  const user = await requireSessionUser();

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      `Access denied. Role "${user.role}" does not have required permissions: [${allowedRoles.join(", ")}]`
    );
  }

  return {
    user,
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
    isPlatform: user.isPlatform,
  };
}

/** The current request's mill id. Throws for anonymous or platform-staff requests. */
export async function requireTenantId(): Promise<string> {
  const user = await requireSessionUser();
  if (user.isPlatform || !user.tenantId) {
    throw new ForbiddenError("This action requires a mill-scoped account.");
  }
  return user.tenantId;
}

/** Ensure the request is from TWJ-Labs platform staff. */
export async function requirePlatform(): Promise<SessionUser> {
  // Ignore "view as mill": the real account is what must be platform staff, so
  // the switcher / exit actions keep working from inside a mill.
  const user = await requireSessionUser({ ignoreViewAs: true });
  if (!user.isPlatform) {
    throw new ForbiddenError("Platform staff only.");
  }
  return user;
}

/** The acting user, with "view as mill" applied. Null when anonymous. */
export async function getEffectiveUser(): Promise<SessionUser | null> {
  try {
    return await requireSessionUser();
  } catch {
    return null;
  }
}

/** Server helper to get the current session user or null. */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}
