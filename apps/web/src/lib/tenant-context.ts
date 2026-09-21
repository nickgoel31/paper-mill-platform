import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";

/**
 * Per-request tenant scope.
 *
 * `tenantId` is the paper mill the current request acts on. `null` + `isPlatform`
 * means a TWJ-Labs platform-staff request (no auto-scoping — platform code
 * filters explicitly).
 *
 * Resolution order (see `resolveTenantContext`):
 *   1. AsyncLocalStorage store, if a `runWithTenantContext(...)` wraps the call
 *      (used for `unstable_cache` bodies, scripts, and cron work).
 *   2. The `x-tenant-id` / `x-is-platform` request headers set by middleware.
 *   3. `null` — the Prisma extension then fails closed on tenant-scoped models.
 */
export interface TenantContext {
  tenantId: string | null;
  isPlatform: boolean;
  userId?: string;
}

// Pinned on globalThis so every bundled copy of this module shares ONE store.
// When the bundler ends up with the route and the Prisma layer holding separate
// copies of a module-level store, `runWithTenantContext` in one is invisible to
// `resolveTenantContext` in the other and every query fails with "No tenant context".
const g = globalThis as { __tenantALS?: AsyncLocalStorage<TenantContext> };
const tenantALS = (g.__tenantALS ??= new AsyncLocalStorage<TenantContext>());

export function runWithTenantContext<T>(ctx: TenantContext, fn: () => T): T {
  return tenantALS.run(ctx, fn);
}

export function getTenantContextSync(): TenantContext | null {
  return tenantALS.getStore() ?? null;
}

export async function resolveTenantContext(): Promise<TenantContext | null> {
  const fromALS = tenantALS.getStore();
  if (fromALS) return fromALS;

  try {
    const h = await headers();
    const isPlatform = h.get("x-is-platform") === "1";
    const tenantId = h.get("x-tenant-id") || null;
    const userId = h.get("x-user-id") || undefined;
    if (isPlatform || tenantId) {
      return { tenantId, isPlatform, userId };
    }
  } catch {
    // headers() unavailable (outside a request, or inside a cache scope with no ALS)
  }
  return null;
}

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}
