import { db } from "@/lib/db";
import { LOOKUP_TAGS } from "./cache-tags";
import { runWithTenantContext } from "@/lib/tenant-context";

export { LOOKUP_TAGS };

/**
 * Cached master-data lookups (clients, machines, trucks, transporters) for one
 * mill. Each takes the caller's `tenantId` — it goes into the cache key (so mills
 * never share an entry) and into the query `where` (explicit tenant scope).
 *
 * All Prisma `Decimal` columns are converted to `number` before returning so the
 * cached payload is plain JSON.
 */

/**
 * One mill's lookup list, tenant-scoped by `tenantId`.
 *
 * Deliberately NOT wrapped in `unstable_cache`: on OpenNext/Cloudflare there is no
 * tag cache configured, so `revalidateTag()` never invalidated these entries and
 * the deckle screen, order form, etc. kept showing machines/clients that had
 * since been added, disabled or deleted. These are small per-mill tables, so
 * reading them fresh is cheap. `keyBase`/`tag` are kept so call sites don't change.
 */
function cachedLookup<T>(
  _keyBase: string,
  _tag: string,
  tenantId: string,
  run: () => Promise<T>
): Promise<T> {
  return runWithTenantContext({ tenantId, isPlatform: false }, run);
}

export type ClientOption = {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
};

export function getClientOptions(tenantId: string): Promise<ClientOption[]> {
  return cachedLookup("lookup-client-options", LOOKUP_TAGS.clients, tenantId, () =>
    db.client.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true, name: true, code: true, city: true, state: true },
      orderBy: { name: "asc" },
    })
  );
}

export type MachineOption = {
  id: string;
  name: string;
  code: string;
  maxDeckleInch: number;
  minDeckleInch: number;
  minTrimInch: number;
  maxTrimInch: number;
  minGsm: number;
  maxGsm: number;
};

export function getMachineOptions(tenantId: string): Promise<MachineOption[]> {
  return cachedLookup("lookup-machine-options", LOOKUP_TAGS.machines, tenantId, async () => {
    const rows = await db.machine.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        maxDeckleInch: true,
        minDeckleInch: true,
        minTrimInch: true,
        maxTrimInch: true,
        minGsm: true,
        maxGsm: true,
      },
      orderBy: { name: "asc" },
    });
    return rows.map((m) => ({
      ...m,
      maxDeckleInch: Number(m.maxDeckleInch),
      minDeckleInch: Number(m.minDeckleInch),
      minTrimInch: Number(m.minTrimInch),
      maxTrimInch: Number(m.maxTrimInch),
    }));
  });
}

/**
 * Machine deckle/GSM envelope used to validate order line items. Derived from
 * the cached machine options so it shares the same invalidation.
 */
export async function getMachineConstraints(tenantId: string) {
  const machines = await getMachineOptions(tenantId);
  const maxDeckle = machines.length > 0 ? Math.max(...machines.map((m) => m.maxDeckleInch)) : 0;
  const minGsm = machines.length > 0 ? Math.min(...machines.map((m) => m.minGsm)) : 0;
  const maxGsm = machines.length > 0 ? Math.max(...machines.map((m) => m.maxGsm)) : 0;
  return { machines, maxDeckle, minGsm, maxGsm };
}

export type TruckOption = {
  id: string;
  registrationNumber: string;
  capacityKg: number;
  transporterId: string | null;
};

export function getTruckOptions(tenantId: string): Promise<TruckOption[]> {
  return cachedLookup("lookup-truck-options", LOOKUP_TAGS.trucks, tenantId, () =>
    db.truck.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        id: true,
        registrationNumber: true,
        capacityKg: true,
        transporterId: true,
      },
      orderBy: { registrationNumber: "asc" },
    })
  );
}

export type TransporterOption = {
  id: string;
  name: string;
  phone: string;
};

export function getTransporterOptions(tenantId: string): Promise<TransporterOption[]> {
  return cachedLookup("lookup-transporter-options", LOOKUP_TAGS.transporters, tenantId, () =>
    db.transporter.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    })
  );
}
