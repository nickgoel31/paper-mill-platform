import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile packages or server external packages if needed
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
