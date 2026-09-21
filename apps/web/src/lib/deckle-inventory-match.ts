/**
 * Inventory-first matching for the deckle planner.
 *
 * Before the cutting-stock solver runs, unallocated inventory reels (AVAILABLE,
 * not tied to any order) are matched to the selected demand. A reel matches an
 * order line only on an EXACT width + GSM (the same rule `allocateStockToOrderItem`
 * enforces), and never pushes a line past its upper tolerance band. Lines the
 * inventory fully covers drop out of the solver's demand; partly covered lines
 * ask the solver only for what's still missing.
 *
 * Pure and dependency-free so it runs identically in the browser and on the server.
 */

export interface MatchDemandItem {
  id: string;
  orderNumber: string;
  clientName: string;
  widthInch: number;
  gsm: number;
  quantityKg: number;
  tolerancePercent: number;
  producedKg: number;
  deliveryDate: Date | string | null;
  priority: string;
}

export interface MatchReel {
  id: string;
  widthInch: number;
  gsm: number;
  quantityKg: number;
  location: string | null;
  createdAt: Date | string;
  originOrderItemId: string | null;
}

export interface InventoryAllocation {
  stockItemId: string;
  orderItemId: string;
  orderNumber: string;
  clientName: string;
  widthInch: number;
  gsm: number;
  quantityKg: number;
  location: string | null;
}

export interface MatchResult<T extends MatchDemandItem> {
  allocations: InventoryAllocation[];
  /** Demand the solver still has to produce (fully covered lines are dropped). */
  remainingItems: Array<T & { solverQuantityKg: number }>;
  /** Order lines the inventory fully covers. */
  coveredItemIds: string[];
}

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, NORMAL: 1, STOCK: 2 };
const EPS = 0.005;

function time(d: Date | string | null): number {
  if (!d) return Number.POSITIVE_INFINITY;
  const t = new Date(d).getTime();
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function matchInventoryToDemand<T extends MatchDemandItem>(
  items: T[],
  reels: MatchReel[],
  excludedReelIds: ReadonlySet<string> = new Set()
): MatchResult<T> {
  // Most urgent / soonest-due lines get first pick of the inventory.
  const ordered = [...items].sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
      time(a.deliveryDate) - time(b.deliveryDate)
  );

  const free = reels
    .filter((r) => !excludedReelIds.has(r.id) && r.quantityKg > 0)
    // Oldest stock first (FIFO).
    .sort((a, b) => time(a.createdAt) - time(b.createdAt));
  const used = new Set<string>();

  const allocations: InventoryAllocation[] = [];
  const assignedKg = new Map<string, number>();
  const covered = new Set<string>();

  for (const item of ordered) {
    const tol = (item.tolerancePercent || 0) / 100;
    const minAcceptable = item.quantityKg * (1 - tol);
    const maxAcceptable = item.quantityKg * (1 + tol);

    let have = item.producedKg || 0; // already covered by earlier production/allocation
    if (have >= minAcceptable) continue; // nothing left to cover

    const candidates = free
      .filter(
        (r) =>
          !used.has(r.id) &&
          r.gsm === item.gsm &&
          Math.abs(r.widthInch - item.widthInch) < EPS
      )
      // A reel that was originally cut for this very line goes first.
      .sort((a, b) => Number(b.originOrderItemId === item.id) - Number(a.originOrderItemId === item.id));

    let assigned = 0;
    for (const reel of candidates) {
      if (have + reel.quantityKg > maxAcceptable + EPS) continue; // would overshoot tolerance
      used.add(reel.id);
      have += reel.quantityKg;
      assigned += reel.quantityKg;
      allocations.push({
        stockItemId: reel.id,
        orderItemId: item.id,
        orderNumber: item.orderNumber,
        clientName: item.clientName,
        widthInch: reel.widthInch,
        gsm: reel.gsm,
        quantityKg: reel.quantityKg,
        location: reel.location,
      });
      if (have >= minAcceptable) break; // line satisfied
    }

    if (assigned > 0) assignedKg.set(item.id, assigned);
    if (have >= minAcceptable) covered.add(item.id);
  }

  const remainingItems: Array<T & { solverQuantityKg: number }> = [];
  for (const item of items) {
    if (covered.has(item.id)) continue;
    const solverQuantityKg = Math.max(0, item.quantityKg - (assignedKg.get(item.id) ?? 0));
    if (solverQuantityKg <= EPS) continue;
    remainingItems.push({ ...item, solverQuantityKg });
  }

  return { allocations, remainingItems, coveredItemIds: Array.from(covered) };
}
