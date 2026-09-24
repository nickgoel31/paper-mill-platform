// Thin wrapper around the OpenNext-generated Worker so Cloudflare Cron
// Triggers (configured in wrangler.toml `[triggers]`) have a `scheduled()`
// handler to call. OpenNext's own `.open-next/worker.js` only exports
// `fetch` (+ Durable Object classes), so `scheduled()` re-enters the same
// Worker over its `WORKER_SELF_REFERENCE` service binding, which runs the
// request through the normal Next.js pipeline (and therefore has the tenant
// context / DB bindings that calling the service function directly here
// would not have).
//
// This file lives outside `src/` so Next.js never bundles it into the app;
// `wrangler deploy` bundles it directly since `main` in wrangler.toml points
// here. It only exists after `@opennextjs/cloudflare build` has produced
// `.open-next/worker.js`, so it is excluded from `tsc --noEmit` (see
// tsconfig.json) to avoid failing typecheck on a fresh checkout before that
// build step has run.
export * from "./.open-next/worker.js";
// @ts-expect-error: only exists after `@opennextjs/cloudflare build`
import worker from "./.open-next/worker.js";

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

const CRON_ROUTES: Record<string, string> = {
  // Monthly, 1st of the month: auto-detect top-ordered width/GSM
  // configurations from the trailing month and refresh Stock Presets.
  "0 3 1 * *": "/api/cron/auto-stock-presets",
  // Daily, end of day (23:55 IST = 18:25 UTC): snapshot the day's order
  // backlog per client (Dealer/Corrugator report).
  "25 18 * * *": "/api/cron/daily-order-report",
};

export default {
  ...worker,
  async scheduled(event: ScheduledEvent, env: any, ctx: any) {
    const path = CRON_ROUTES[event.cron];
    if (!path) return;
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch(`https://internal.local${path}`, {
        method: "POST",
        headers: { "x-cron-trigger": event.cron },
      }).catch((err: any) => {
        console.error(`Scheduled job for cron "${event.cron}" failed:`, err);
      })
    );
  },
};
