import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

export default defineCloudflareConfig({
  // D1, R2, and KV bindings are declared in wrangler.toml
  // and automatically available in the edge runtime via env bindings.
  //
  // KV-backed incremental cache so `unstable_cache()` / route revalidation
  // survive across requests and isolates (bound as NEXT_INC_CACHE_KV).
  incrementalCache: kvIncrementalCache,
});
