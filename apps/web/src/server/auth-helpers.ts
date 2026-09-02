import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: You must be logged in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden: Insufficient role permissions.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Server-side helper to ensure the user has one of the allowed roles.
 * Throws an error if the user is not authenticated or lacks the required role.
 */
export async function requireRole(...allowedRoles: Role[]) {
  const session = await auth();

  if (!session || !session.user) {
    throw new UnauthorizedError();
  }

  const userRole = (session.user as any).role as Role;

  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    throw new ForbiddenError(
      `Access denied. Role "${userRole}" does not have required permissions: [${allowedRoles.join(", ")}]`
    );
  }

  return {
    user: session.user,
    userId: session.user.id as string,
    role: userRole,
  };
}

/**
 * Server helper to get current session or null
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}
