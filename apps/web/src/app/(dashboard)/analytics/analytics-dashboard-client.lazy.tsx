"use client";

import dynamic from "next/dynamic";

// Loaded client-side only so the recharts bundle never enters the Worker.
export const AnalyticsDashboardClient = dynamic(
  () => import("./analytics-dashboard-client").then((m) => m.AnalyticsDashboardClient),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-sm text-muted-foreground">Loading analytics…</div>
    ),
  },
);
