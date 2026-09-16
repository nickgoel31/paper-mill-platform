import Dexie, { type EntityTable } from "dexie";

export interface CachedRead {
  id: string; // `${tenantId}::${cacheKey}`
  tenantId: string;
  cacheKey: string;
  data: unknown;
  fetchedAt: number;
}

export type MutationStatus = "pending" | "syncing" | "synced" | "failed";

export interface QueuedMutation {
  id?: number; // autoincrement
  clientOpId: string;
  tenantId: string;
  userId: string | null;
  entity: string;
  actionName: string;
  args: unknown[];
  status: MutationStatus;
  createdAt: number;
  syncedAt: number | null;
  lastError: string | null;
  appVersion: string;
}

export interface OfflineMeta {
  key: string; // e.g. `lastSync::${entity}`
  value: number;
}

const db = new Dexie("papermill-offline") as Dexie & {
  cachedReads: EntityTable<CachedRead, "id">;
  queuedMutations: EntityTable<QueuedMutation, "id">;
  meta: EntityTable<OfflineMeta, "key">;
};

db.version(1).stores({
  cachedReads: "id, tenantId, cacheKey, fetchedAt",
  queuedMutations: "++id, clientOpId, tenantId, entity, status, createdAt",
  meta: "key",
});

export { db };

export function cachedReadId(tenantId: string, cacheKey: string): string {
  return `${tenantId}::${cacheKey}`;
}
