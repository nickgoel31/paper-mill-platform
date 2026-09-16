"use client";

import { getSession } from "next-auth/react";

const STORAGE_KEY = "pm-offline-identity";

export interface OfflineIdentity {
  tenantId: string;
  userId: string;
}

let cached: OfflineIdentity | null = null;

function readStorage(): OfflineIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.tenantId === "string" && typeof parsed?.userId === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStorage(identity: OfflineIdentity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage unavailable (private browsing, quota) — identity just won't
    // survive a full reload while offline; non-fatal.
  }
}

/**
 * Resolves the current tenant/user for scoping the offline cache. Tries a
 * live session fetch first (also refreshes the offline copy for later use
 * while disconnected); falls back to the last-known identity from
 * localStorage when the network request itself fails.
 */
export async function getOfflineIdentity(): Promise<OfflineIdentity | null> {
  if (cached) return cached;

  try {
    const session = await getSession();
    const user = session?.user as { id?: string; tenantId?: string | null } | undefined;
    if (user?.id && user?.tenantId) {
      const identity = { tenantId: user.tenantId, userId: user.id };
      cached = identity;
      writeStorage(identity);
      return identity;
    }
  } catch {
    // offline or session endpoint unreachable — fall through to storage
  }

  const stored = readStorage();
  if (stored) {
    cached = stored;
    return stored;
  }
  return null;
}

export function clearOfflineIdentity() {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
