import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/sallary-people',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
