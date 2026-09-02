import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-d1", "@prisma/adapter-neon", "bcryptjs"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
