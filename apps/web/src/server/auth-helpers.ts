import { auth } from "@/lib/auth";
import { Role } from "@/generated/prisma/browser";
import { isPlatformEmail } from "@/lib/platform";

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
};

async function requireSessionUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session || !session.user) {
    throw new UnauthorizedError();
  }
  const u = session.user as any;
  return {
    id: u.id as string,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    tenantId: (u.tenantId ?? null) as string | null,
    isPlatform: u.isPlatform === true || isPlatformEmail(u.email),
  };
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
  const user = await requireSessionUser();
  if (!user.isPlatform) {
    throw new ForbiddenError("Platform staff only.");
  }
  return user;
}

/** Server helper to get the current session user or null. */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}
