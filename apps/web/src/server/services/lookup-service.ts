import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { LOOKUP_TAGS } from "./cache-tags";

export { LOOKUP_TAGS };

/**
 * Cached master-data lookups (clients, machines, trucks, transporters).
 *
 * These lists change rarely but are read on almost every dashboard page as
 * dropdown/reference data. Each was previously a fresh D1 round trip per
 * navigation. They are now served from the KV-backed incremental cache and only
 * re-queried when the underlying master data is mutated (see `revalidateTag`
 * calls in the corresponding `*-service.ts` files) or after `revalidate`
 * seconds, whichever comes first.
 *
 * All Prisma `Decimal` columns are converted to `number` before returning so the
 * cached payload is plain JSON.
 */

// Master data changes rarely; a mutation calls `revalidateTag` for an immediate
// refresh where a tag cache is configured, and this TTL bounds staleness
// otherwise.
const LOOKUP_REVALIDATE_SECONDS = 120;

export type ClientOption = {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
};

export const getClientOptions = unstable_cache(
  async (): Promise<ClientOption[]> => {
    return db.client.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, code: true, city: true, state: true },
      orderBy: { name: "asc" },
    });
  },
  ["lookup-client-options"],
  { tags: [LOOKUP_TAGS.clients], revalidate: LOOKUP_REVALIDATE_SECONDS }
);

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

export const getMachineOptions = unstable_cache(
  async (): Promise<MachineOption[]> => {
    const rows = await db.machine.findMany({
      where: { deletedAt: null, isActive: true },
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
  },
  ["lookup-machine-options"],
  { tags: [LOOKUP_TAGS.machines], revalidate: LOOKUP_REVALIDATE_SECONDS }
);

/**
 * Machine deckle/GSM envelope used to validate order line items. Derived from
 * the cached machine options so it shares the same invalidation.
 */
export async function getMachineConstraints() {
  const machines = await getMachineOptions();
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

export const getTruckOptions = unstable_cache(
  async (): Promise<TruckOption[]> => {
    return db.truck.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        registrationNumber: true,
        capacityKg: true,
        transporterId: true,
      },
      orderBy: { registrationNumber: "asc" },
    });
  },
  ["lookup-truck-options"],
  { tags: [LOOKUP_TAGS.trucks], revalidate: LOOKUP_REVALIDATE_SECONDS }
);

export type TransporterOption = {
  id: string;
  name: string;
  phone: string;
};

export const getTransporterOptions = unstable_cache(
  async (): Promise<TransporterOption[]> => {
    return db.transporter.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    });
  },
  ["lookup-transporter-options"],
  { tags: [LOOKUP_TAGS.transporters], revalidate: LOOKUP_REVALIDATE_SECONDS }
);
