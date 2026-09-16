"use client";

import { cachedReadId, db } from "./db";
import { getOfflineIdentity } from "./identity";
import { kickSyncEngine, registerOfflineAction } from "./sync-engine";

export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_BUILD_ID || "dev";

/** True only for calls that never reached the server — not for a normal thrown business/validation error. */
function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch() throws TypeError on network failure
  const message = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|network request failed|load failed/i.test(message);
}

export interface OfflineReadResult<T> {
  data: T | null;
  fromCache: boolean;
  empty: boolean;
  cachedAt: number | null;
}

/**
 * Wraps a read-style server action so its last successful result is cached
 * (per tenant) in IndexedDB and served back when the live call fails offline,
 * instead of throwing and blanking the screen.
 */
export function createOfflineReadAction<Args extends unknown[], T>(
  readFn: (...args: Args) => Promise<T>,
  options: { cacheKey: (...args: Args) => string; ttlMs?: number }
) {
  return async (...args: Args): Promise<OfflineReadResult<T>> => {
    const identity = await getOfflineIdentity();
    const tenantId = identity?.tenantId ?? "unknown";
    const cacheKey = options.cacheKey(...args);
    const rowId = cachedReadId(tenantId, cacheKey);

    try {
      const data = await readFn(...args);
      if (identity) {
        await db.cachedReads.put({
          id: rowId,
          tenantId,
          cacheKey,
          data: data as unknown,
          fetchedAt: Date.now(),
        });
      }
      return { data, fromCache: false, empty: false, cachedAt: Date.now() };
    } catch (err) {
      if (!isNetworkFailure(err)) throw err;

      const cached = await db.cachedReads.get(rowId);
      if (cached) {
        return {
          data: cached.data as T,
          fromCache: true,
          empty: false,
          cachedAt: cached.fetchedAt,
        };
      }
      return { data: null, fromCache: true, empty: true, cachedAt: null };
    }
  };
}

export interface OfflineWriteResult<T> {
  data: T | null;
  queued: boolean;
  clientOpId: string | null;
}

/**
 * Wraps a mutation-style server action. If offline (or the call fails with a
 * network error, as opposed to a normal validation/business error thrown by
 * the action itself), the call is queued in IndexedDB and replayed in order
 * by the sync engine once connectivity returns.
 */
export function createOfflineWriteAction<Args extends unknown[], T>(
  writeFn: (...args: Args) => Promise<T>,
  options: { entity: string; actionName: string }
) {
  // Registered eagerly (not lazily on first queue) so a queued item created
  // in an earlier session still finds its handler as soon as this module
  // loads on the next visit, before the user does anything.
  registerOfflineAction(options.actionName, writeFn as (...a: unknown[]) => Promise<unknown>);

  return async (...args: Args): Promise<OfflineWriteResult<T>> => {
    const offlineNow = typeof navigator !== "undefined" && navigator.onLine === false;

    if (!offlineNow) {
      try {
        const data = await writeFn(...args);
        return { data, queued: false, clientOpId: null };
      } catch (err) {
        if (!isNetworkFailure(err)) throw err; // real validation/business error — surface immediately
      }
    }

    const identity = await getOfflineIdentity();
    const clientOpId = crypto.randomUUID();
    await db.queuedMutations.add({
      clientOpId,
      tenantId: identity?.tenantId ?? "unknown",
      userId: identity?.userId ?? null,
      entity: options.entity,
      actionName: options.actionName,
      args,
      status: "pending",
      createdAt: Date.now(),
      syncedAt: null,
      lastError: null,
      appVersion: APP_VERSION,
    });
    kickSyncEngine();
    return { data: null, queued: true, clientOpId };
  };
}
