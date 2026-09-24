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
  /**
   * Set together with `userId` only by trusted internal callers acting on
   * behalf of a real user with no browser session (the WhatsApp webhook,
   * scheduled jobs) — see `requireRole`'s ALS fallback in auth-helpers.ts.
   * Never populated from request headers or other client-controlled input.
   */
  role?: string;
}

// Next.js compiles this module once per server layer (RSC / SSR / server actions),
// and each copy would otherwise get its OWN AsyncLocalStorage. `db.ts` caches its
// tenant-scoped Prisma client on `globalThis`, so that one client is shared by all
// layers but reads the store of whichever layer created it first — a tenant set
// via `runWithTenantContext` in another layer was invisible to it ("No tenant
// context for Order.findMany"). Pinning the store to `globalThis` gives every
// copy the same instance.
declare global {
  // eslint-disable-next-line no-var
  var __tenantALS: AsyncLocalStorage<TenantContext> | undefined;
}
const tenantALS = (globalThis.__tenantALS ??= new AsyncLocalStorage<TenantContext>());

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
