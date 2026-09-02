/**
 * Cloudflare Workers KV Cache Utility (1 GB Free Edge Storage, 100k Reads/day)
 * Used for ultra-fast lookup of machine deckle boundaries, GSM presets, and client defaults.
 */

// In-memory local fallback map for local development when KV binding is not present
const localMemoryCache = new Map<string, { value: any; expiresAt?: number }>();

export interface KVNamespaceLike {
  get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<any>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

function getGlobalKV(): KVNamespaceLike | null {
  if (typeof globalThis !== "undefined" && (globalThis as any).ERP_KV) {
    return (globalThis as any).ERP_KV;
  }
  return null;
}

/**
 * Get a cached item from Workers KV (or in-memory cache in dev)
 */
export async function getCachedItem<T = any>(key: string): Promise<T | null> {
  const kv = getGlobalKV();
  if (kv) {
    try {
      const data = await kv.get(key, "json");
      return (data as T) ?? null;
    } catch {
      return null;
    }
  }

  // Local fallback
  const cached = localMemoryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt && Date.now() > cached.expiresAt) {
    localMemoryCache.delete(key);
    return null;
  }
  return cached.value as T;
}

/**
 * Store an item in Workers KV with optional expiration TTL in seconds
 */
export async function setCachedItem<T = any>(
  key: string,
  value: T,
  ttlSeconds = 86400 // Default 24 hours
): Promise<void> {
  const kv = getGlobalKV();
  if (kv) {
    try {
      await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
      return;
    } catch (err) {
      console.warn("[Workers KV] Put warning:", err);
    }
  }

  // Local fallback
  localMemoryCache.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
  });
}

/**
 * Remove an item from Workers KV
 */
export async function deleteCachedItem(key: string): Promise<void> {
  const kv = getGlobalKV();
  if (kv) {
    try {
      await kv.delete(key);
      return;
    } catch {
      // Ignore
    }
  }
  localMemoryCache.delete(key);
}
