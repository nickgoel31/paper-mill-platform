import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // D1, R2, and KV bindings are declared in wrangler.toml
  // and automatically available in the edge runtime via env bindings
});

