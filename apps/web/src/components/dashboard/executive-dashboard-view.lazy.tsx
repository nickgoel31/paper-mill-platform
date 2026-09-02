"use client";

import dynamic from "next/dynamic";

// Loaded client-side only so the recharts bundle never enters the Worker.
export const ExecutiveDashboardView = dynamic(
  () => import("./executive-dashboard-view").then((m) => m.ExecutiveDashboardView),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-sm text-muted-foreground">Loading dashboard…</div>
    ),
  },
);
