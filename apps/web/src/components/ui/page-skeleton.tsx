import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic route-level loading placeholder. Rendered by `loading.tsx` files while
 * a server component (and its D1 queries) resolves, so navigation feels instant
 * instead of leaving the previous page frozen.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>

      {/* Content block / table */}
      <div className="space-y-3 rounded-xl border border-slate-100 p-4">
        <Skeleton className="h-9 w-full max-w-sm" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
