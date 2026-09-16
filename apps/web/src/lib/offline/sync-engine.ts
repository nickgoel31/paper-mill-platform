"use client";

import { toast } from "sonner";
import { db } from "./db";

type RegisteredAction = (...args: unknown[]) => Promise<unknown>;

/**
 * Dexie can't persist function references, so queued mutations store the
 * action *name* and are replayed by looking it up here. Every offline-wrapped
 * write action must register itself once (see registerOfflineAction) so a
 * queued call can find its real implementation again after a reload.
 */
const actionRegistry = new Map<string, RegisteredAction>();

export function registerOfflineAction(actionName: string, fn: RegisteredAction) {
  actionRegistry.set(actionName, fn);
}

let syncing = false;
let authExpiredNoticeShown = false;

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unauthorized|unauthenticated|please log in|forbidden/i.test(message);
}

/** Replays queued mutations for the current session, oldest first, stopping at the first still-failing item so later writes never jump ahead of an earlier one on the same record. */
export async function runSync(): Promise<void> {
  if (syncing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  syncing = true;

  try {
    const pending = await db.queuedMutations
      .where("status")
      .anyOf(["pending", "failed"])
      .sortBy("createdAt");

    if (pending.length === 0) return;

    let syncedCount = 0;
    for (const item of pending) {
      const fn = actionRegistry.get(item.actionName);
      if (!fn) {
        await db.queuedMutations.update(item.id!, {
          status: "failed",
          lastError: `No registered handler for "${item.actionName}" (app may need a refresh after an update).`,
        });
        break;
      }

      await db.queuedMutations.update(item.id!, { status: "syncing" });
      try {
        await fn(...(item.args as unknown[]));
        await db.queuedMutations.update(item.id!, {
          status: "synced",
          syncedAt: Date.now(),
          lastError: null,
        });
        syncedCount += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        await db.queuedMutations.update(item.id!, { status: "failed", lastError: message });

        if (isAuthError(err)) {
          if (!authExpiredNoticeShown) {
            authExpiredNoticeShown = true;
            toast.error("Please log in again to sync your pending changes.", { duration: 10000 });
          }
        } else {
          toast.error(`Could not sync a queued change: ${message}`, {
            description: "It will stay queued — open the pending sync list to review it.",
          });
        }
        break; // preserve order: don't sync newer items ahead of a stuck one
      }
    }

    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} change${syncedCount === 1 ? "" : "s"} saved while offline.`);
    }

    // Housekeeping: drop confirmed-synced rows older than a day so the queue table doesn't grow unbounded.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const stale = await db.queuedMutations
      .where("status")
      .equals("synced")
      .filter((m) => (m.syncedAt ?? 0) < cutoff)
      .primaryKeys();
    if (stale.length > 0) await db.queuedMutations.bulkDelete(stale);
  } finally {
    syncing = false;
  }
}

export function kickSyncEngine() {
  void runSync();
}

let initialized = false;

/** Call once from a root client component. Wires the `online` event and a periodic fallback (for flaky connections that never fire a clean event) to the replay loop. */
export function initSyncEngine() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("online", () => void runSync());
  if (navigator.onLine) void runSync();
  setInterval(() => void runSync(), 60_000);
}

export async function discardQueuedMutation(id: number) {
  await db.queuedMutations.delete(id);
}

export async function retryQueuedMutation(id: number) {
  await db.queuedMutations.update(id, { status: "pending", lastError: null });
  kickSyncEngine();
}
