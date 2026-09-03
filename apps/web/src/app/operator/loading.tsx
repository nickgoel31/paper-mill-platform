import { Skeleton } from "@/components/ui/skeleton";

export default function OperatorLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56 bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl bg-slate-800" />
        ))}
      </div>
    </div>
  );
}
