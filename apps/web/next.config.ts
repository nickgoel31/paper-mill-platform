import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-d1", "bcryptjs"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

// Enable the Cloudflare bindings (D1, R2, KV) during `next dev` so that
// getCloudflareContext() works the same way it does on the deployed Worker.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
